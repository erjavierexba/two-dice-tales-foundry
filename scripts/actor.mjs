import { TDT } from "./config.mjs";
import { chooseAutomaticBonus, dieScore, normalizeDie, perfectSuccess, resolveTdtRoll, stepDie, stepDieToOne, stepRolledDie } from "./dice.mjs";
import { collectModifiers, hasItemNamed, itemNameSet, modifierValue } from "./modifiers.mjs";
import { moduleActive, rule } from "./settings.mjs";
import { automaticDifficultyText, warnIfAllImmune, finalDamage, parseWeaponProperties, targetDefense, targetEndurance, targetImmune, weaponProfile } from "./attack.mjs";
import { esc, payload, requestDamage } from "./chat.mjs";
import * as Fantasy from "./modules/fantasy.mjs";
import * as Mecha from "./modules/mecha.mjs";
import * as Zombie from "./modules/zombie.mjs";
import * as Cyber from "./modules/cyber.mjs";
import { normalizeMoney } from "./economy.mjs";

const ATTACK_SKILLS = new Set(["melee", "brawl", "ranged"]);
const ACTOR_IMAGES = {
  character: "systems/tdt/assets/icons/character.svg",
  npc: "systems/tdt/assets/icons/npc.svg",
  mecha: "systems/tdt/assets/icons/mecha.svg"
};

export class TDTActor extends Actor {
  /* -------------------------------------------- */
  /*  Derived data                                 */
  /* -------------------------------------------- */

  /** Foundry crea todos los tokens como hostiles: los personajes nacen amistosos y enlazados a su ficha. */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    {
      const changes = {};
      if (foundry.utils.getProperty(data, "img") === undefined) changes.img = ACTOR_IMAGES[this.type] ?? ACTOR_IMAGES.character;
      if (this.type === "character") {
        if (foundry.utils.getProperty(data, "prototypeToken.disposition") === undefined) changes["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
        if (foundry.utils.getProperty(data, "prototypeToken.actorLink") === undefined) changes["prototypeToken.actorLink"] = true;
      }
      const money = foundry.utils.getProperty(data, "system.money");
      if (money !== undefined) changes["system.money"] = normalizeMoney(money);
      if (Object.keys(changes).length) this.updateSource(changes);
    }
    return allowed;
  }

  /** Recuperar vida por cualquier vía (ficha, barra del token, curación…) termina el estado de caído. */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;
    const health = foundry.utils.getProperty(changed, "system.health.value");
    if (health !== undefined && Number(health) > 0 && this.system.dying?.active && foundry.utils.getProperty(changed, "system.dying.active") === undefined) {
      foundry.utils.setProperty(changed, "system.dying.active", false);
      foundry.utils.setProperty(changed, "system.dying.difficulty", 0);
    }
    const money = foundry.utils.getProperty(changed, "system.money");
    if (money !== undefined) foundry.utils.setProperty(changed, "system.money", normalizeMoney(money));
    return allowed;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    const system = this.system;
    if (this.type === "mecha") {
      const collected = collectModifiers(this, { cat: system.category });
      this._tdtMods = collected;
      this._tdtFlags = collected.flags;
      Mecha.prepareMecha(this, collected);
      return;
    }
    if (!system?.attributes) return;
    const collected = collectModifiers(this);
    this._tdtMods = collected;
    this._tdtFlags = collected.flags;
    const value = target => modifierValue(collected, target);

    for (const [key, attribute] of Object.entries(system.attributes)) attribute.value = stepRolledDie(attribute.die, value(`step.attribute.${key}`));
    for (const [key, defense] of Object.entries(system.defenses)) defense.value = stepRolledDie(defense.die, value(`step.defense.${key}`));

    const chips = this.items.filter(item => item.type === "gear" && item.system.category === "skillChip" && item.system.loaded && item.system.chipTarget);
    for (const [key, skill] of Object.entries(system.skills)) {
      const chip = chips.some(item => item.system.chipTarget === key);
      const baseDie = normalizeDie(skill.die);
      skill.chipBonus = chip && baseDie === 12 ? 1 : 0;
      skill.value = stepDie(baseDie, value(`step.skill.${key}`) + (chip && baseDie !== 12 ? 1 : 0));
      skill.chip = chip;
    }
    for (const [key, defense] of Object.entries(system.defenses)) {
      const chip = chips.some(item => item.system.chipTarget === key);
      defense.chipBonus = chip && defense.value === 12 ? 1 : 0;
      if (chip && defense.value !== 12) defense.value = stepRolledDie(defense.value, 1);
      defense.chip = chip;
    }
    const perceptionBase = value("step.perception");
    system.perception.auditoryFaces = stepRolledDie(4, perceptionBase + value("step.perception.auditory"));
    system.perception.visualFaces = stepRolledDie(4, perceptionBase + value("step.perception.visual"));
    system.perception.faces = stepRolledDie(4, perceptionBase);

    const armor = this.items.filter(item => item.type === "armor" && item.system.equipped);
    const cyberOn = moduleActive("cyber");
    let armorEndurance = 0;
    let shotArmor = 0;
    for (const item of armor) {
      const base = Math.max(0, Number(item.system.endurance || 0) - Number(item.system.damage || 0));
      const pristine = cyberOn && item.system.pristine && base > 0 ? 1 : 0;
      const broken = Number(item.system.endurance || 0) > 0 && base <= 0;
      item.system.broken = broken;
      armorEndurance += base + pristine;
      const shot = Number(item.system.shotEndurance || 0);
      shotArmor += (shot ? Math.max(0, shot - Number(item.system.damage || 0)) : base) + pristine;
    }
    const evasionPenalty = armor.reduce((sum, item) => sum + Number(item.system.evasionPenalty || 0), 0);
    if (this.type !== "npc") system.endurance.base = dieScore(system.attributes.power.value);
    system.endurance.natural = Math.max(0, Number(system.endurance.base) + (this.type === "npc" ? 0 : value("endurance")));
    system.endurance.armor = armorEndurance + value("armor");
    system.endurance.value = this.type === "npc"
      ? Number(system.endurance.base || 0)
      : Math.max(0, system.endurance.natural + system.endurance.armor);
    system.endurance.vsShots = Math.max(0, system.endurance.natural + shotArmor + value("armor"));
    system.defenses.evasion.armorPenalty = evasionPenalty + value("evasionPenalty");
    system.health.modifier = value("health");
    system.health.effectiveMax = Math.max(1, Number(system.health.max) + system.health.modifier);

    if (cyberOn) system.cyberStats = Cyber.cyberStats(this, collected);
    if (moduleActive("fantasy")) {
      system.fantasy.manaMax = Fantasy.manaMax(this, value("mana"));
      system.fantasy.reserveMax = Fantasy.incrementalReserve(this);
    }
    if (moduleActive("powers")) {
      const weakBonus = rule("weakPoint") ? Number(system.powers.weakPoint?.bonus || 0) : 0;
      system.powers.energyMax = Math.max(0, 20 + value("energy") + weakBonus);
    }
    if (moduleActive("zombie")) {
      system.zombie.foodNeed = Zombie.foodNeed(system, value("foodNeed"));
      if (this.type === "npc" && Number(system.npcStats.group) > 1) {
        system.zombie.group = Zombie.zombieGroupStats(system.npcStats.group, system.health.value);
      }
    }
  }

  /** Token HUD edits of the health bar are clamped to the effective maximum (base + feats), not the base value. */
  async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
    if (attribute !== "health" || this.type === "mecha" || !isBar) return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
    const current = Number(this.system.health.value) || 0;
    const max = Number(this.system.health.effectiveMax ?? this.system.health.max) || 0;
    const next = Math.min(max, Math.max(0, isDelta ? current + Number(value) : Number(value)));
    const updates = { "system.health.value": next };
    const allowed = Hooks.call("modifyTokenAttribute", { attribute, value, isDelta, isBar }, updates, this);
    return allowed !== false ? this.update(updates) : this;
  }

  /** Special flags from items. A mecha also uses its pilot's feats (Mechasinapsis, Vincula voluntad…). */
  get tdtFlags() {
    const own = this._tdtFlags ?? new Set();
    if (this.type !== "mecha" || !this.system.pilot) return own;
    const pilot = fromUuidSync(this.system.pilot);
    if (!pilot?.tdtFlags) return own;
    return new Set([...own, ...pilot.tdtFlags]);
  }

  /* -------------------------------------------- */
  /*  Basic checks                                 */
  /* -------------------------------------------- */

  async rollSkill(skillKey, options = {}) {
    const skill = this.system.skills[skillKey];
    if (!skill) return null;
    const attributeKey = options.attribute ?? skill.attribute;
    const attribute = this.system.attributes[attributeKey];
    return this.rollCheck({
      kind: "skill",
      label: options.label ?? skill.label,
      scopes: [skillKey, attributeKey, ...(options.scopes ?? [])],
      primaryScope: attributeKey,
      secondaryScope: skillKey,
      first: { label: attribute.label, faces: attribute.value ?? attribute.die },
      second: { label: skill.label, faces: options.minimumSkill ? Math.max(options.minimumSkill, skill.value ?? 0) : (skill.value ?? skill.die) },
      difficulty: options.difficulty ?? 0,
      extraRules: [...(skill.chipBonus ? [{ type: "bonus", value: 1, label: "Chip de habilidad (d12)" }] : []), ...(options.extraRules ?? [])],
      reroll: { method: "rollSkill", args: [skillKey, stripOptions(options)] },
      silent: options.silent,
      after: options.after
    }, options.preset);
  }

  async rollDefense(defenseKey, options = {}) {
    const defense = this.system.defenses[defenseKey];
    if (!defense) return null;
    const attribute = this.system.attributes[defense.attribute];
    const extraRules = [...(options.extraRules ?? [])];
    if (defense.chipBonus) extraRules.push({ type: "bonus", value: 1, label: "Chip de defensa (d12)" });
    if (defenseKey === "evasion" && Number(defense.armorPenalty)) extraRules.push({ type: "penalty", value: Number(defense.armorPenalty), label: "Armadura" });
    return this.rollCheck({
      kind: "defense",
      label: options.label ?? defense.label,
      scopes: [defenseKey, defense.attribute, ...(options.scopes ?? [])],
      primaryScope: defense.attribute,
      secondaryScope: defenseKey,
      first: { label: attribute.label, faces: attribute.value ?? attribute.die },
      second: { label: defense.label, faces: defense.value ?? defense.die },
      difficulty: options.difficulty ?? 0,
      extraRules,
      reroll: { method: "rollDefense", args: [defenseKey, stripOptions(options)] },
      silent: options.silent,
      after: options.after
    }, options.preset);
  }

  async rollPerception(options = {}) {
    const selectedSense = ["general", "visual", "auditory"].includes(options.sense) ? options.sense : "general";
    const senses = {
      general: { label: "General", faces: this.system.perception?.faces ?? 4 },
      visual: { label: "Visual", faces: this.system.perception?.visualFaces ?? 4 },
      auditory: { label: "Sonoro", faces: this.system.perception?.auditoryFaces ?? 4 }
    };
    return this.rollCheck({
      kind: "perception",
      label: options.label ?? "Percepción",
      scopes: ["perception", ...(options.scopes ?? [])],
      primaryScope: "perception",
      secondaryScope: "perception",
      first: { label: "Percepción", faces: senses[selectedSense].faces },
      second: { label: "Percepción", faces: senses[selectedSense].faces },
      senseFaces: Object.fromEntries(Object.entries(senses).map(([key, sense]) => [key, sense.faces])),
      senseLabels: Object.fromEntries(Object.entries(senses).map(([key, sense]) => [key, sense.label])),
      linkedDice: true,
      difficulty: options.difficulty ?? 0,
      extraRules: options.extraRules ?? [],
      extraFields: `<div class="form-group"><label>Tipo de percepción</label><select name="perceptionSense"><option value="general" ${selectedSense === "general" ? "selected" : ""}>General</option><option value="visual" ${selectedSense === "visual" ? "selected" : ""}>Visual</option><option value="auditory" ${selectedSense === "auditory" ? "selected" : ""}>Sonoro</option></select></div>`,
      readExtra: (_form, data) => ({ perceptionSense: data.get("perceptionSense") || selectedSense }),
      reroll: { method: "rollPerception", args: [stripOptions(options)] },
      silent: options.silent
    }, options.preset);
  }

  /** Defending against a hack: Mente + Hacking (at least d4) for intrusions, otherwise the hack's defense. */
  async rollHackDefense(defense, options = {}) {
    const stats = this.system.cyberStats ?? {};
    const extraRules = [...(options.extraRules ?? [])];
    if (stats.firewall) extraRules.push({ type: "bonus", value: 1, label: "Extrafirewall" });
    const firewallHack = this.items.find(item => item.type === "hack" && item.system.loaded && /cortafuegos activo/i.test(item.name));
    if (firewallHack && stats.usesLeft > 0) extraRules.push({ type: "bonus", value: 2, label: "Cortafuegos activo (gasta un uso de hack)", optional: true, consume: "hackUse" });
    const scopes = ["hack-defense", ...(options.scopes ?? [])];
    if (defense === "hacking") {
      return this.rollSkill("hacking", { ...options, attribute: "mind", minimumSkill: 4, scopes, extraRules, label: options.label ?? "Defensa contra intrusión" });
    }
    if (["evasion", "fortitude", "will"].includes(defense)) return this.rollDefense(defense, { ...options, scopes, extraRules });
    return null;
  }

  /* -------------------------------------------- */
  /*  Generic roll engine                          */
  /* -------------------------------------------- */

  async rollCheck(check, preset) {
    const options = preset ?? await this._rollOptionsDialog(check);
    if (!options) return null;
    const outcome = await this._executeRoll(check, options);
    if (!outcome) return null;
    const extra = check.after ? await check.after(outcome) : null;
    if (!check.silent) await this._postRoll(check, outcome, extra);
    return outcome.result;
  }

  async _executeRoll(check, options) {
    const senseFaces = check.senseFaces?.[options.extra?.perceptionSense];
    const firstBaseFaces = senseFaces ?? check.first.faces;
    const secondBaseFaces = senseFaces ?? check.second.faces;
    const stepFirst = faces => {
      if (options.firstFloorOne) return stepDieToOne(faces, options.firstStep);
      return check.first.allowZero ? stepDie(faces, options.firstStep) : stepRolledDie(faces, options.firstStep);
    };
    const faces = [
      check.first.allowZero || firstBaseFaces ? stepFirst(firstBaseFaces) : 0,
      options.secondFloorOne ? stepDieToOne(secondBaseFaces, options.secondStep) : stepDie(secondBaseFaces, options.secondStep)
    ];
    if (check.minimumFaces) for (let i = 0; i < 2; i++) if (faces[i] && faces[i] < check.minimumFaces) faces[i] = check.minimumFaces;
    if (options.linkWill && check.third?.faces) faces.push(normalizeDie(check.third.faces));
    const rolls = [];
    const rollDie = async (dieFaces, mode) => {
      if (!dieFaces) return 1;
      const reroll = options.rerollOnes ? "rr1" : "";
      const formula = mode === "low" ? `2d${dieFaces}${reroll}kl` : mode === "high" ? `2d${dieFaces}${reroll}kh` : `1d${dieFaces}${reroll}`;
      const roll = await new Roll(formula).evaluate();
      rolls.push(roll);
      return roll.total;
    };
    const firstCandidates = [{ label: check.first.label, faces: faces[0] }];
    for (const alternative of check.first.alternatives ?? []) firstCandidates.push({ label: alternative.label, faces: stepFirst(alternative.faces) });
    const firstResults = [];
    for (const candidate of firstCandidates) firstResults.push(await rollDie(candidate.faces, options.firstDisadvantage ? "low" : null));
    // Ventaja y desventaja sobre el mismo dado se anulan.
    const secondMode = options.secondAdvantage === Boolean(options.secondDisadvantage) ? null : options.secondAdvantage ? "high" : "low";
    let second = await rollDie(faces[1], secondMode);
    // Alergia, Cegato, Duro de oído: se añade 1d4 y se conservan los dos dados menores.
    let worseSlot = null;
    if (options.worseDie) {
      const worse = await rollDie(options.worseDie);
      if (worse < Math.max(firstResults[0], second)) {
        worseSlot = second >= firstResults[0] ? 1 : 0;
        if (worseSlot === 1) second = worse;
        else firstResults[0] = worse;
      }
    }
    const third = faces.length > 2 ? await rollDie(faces[2]) : null;
    let flat = Number(options.flat || 0);
    const extraResults = [];
    for (const extraFaces of options.extraDice ?? []) {
      const value = await rollDie(extraFaces);
      extraResults.push({ faces: extraFaces, value });
      flat += value;
    }
    const linkedDice = Boolean(check.linkedDice);
    let best = null;
    firstCandidates.forEach((candidate, index) => {
      const candidateFaces = [candidate.faces, linkedDice ? candidate.faces : faces[1], ...(faces.length > 2 ? [faces[2]] : [])];
      if (worseSlot !== null && (worseSlot === 1 || index === 0)) candidateFaces[worseSlot] = options.worseDie;
      const raw = [firstResults[index], second, ...(third !== null ? [third] : [])];
      const criticalExtra = Number(options.criticalExtra || 0);
      const allocations = options.noBonus ? raw.map(() => 0) : chooseAutomaticBonus(raw, candidateFaces, options.bonus, { flat, criticalExtra });
      const result = resolveTdtRoll({ rawResults: raw, faces: candidateFaces, bonusAllocations: allocations, penalty: options.penalty, difficulty: options.difficulty, flat, criticalExtra });
      if (!best || result.total > best.result.total) best = { result, raw, allocations, faces: candidateFaces, candidate, index };
    });
    const { result } = best;
    if (options.noFumble && result.isFumble) {
      result.isFumble = false;
      if (result.difficulty) result.success = result.total >= result.difficulty;
    }
    result.extraResults = extraResults;
    // Las reglas de «baja/sube la dificultad» también cuentan al comparar con la defensa de cada objetivo.
    result.difficultyMod = Number(options.difficultyMod || 0);
    result.alternatives = firstCandidates.length > 1 ? firstCandidates.map((candidate, index) => ({ label: candidate.label, faces: candidate.faces, value: firstResults[index] })) : null;
    result.chosen = best.candidate.label;
    if (options.consumed?.includes("hackUse")) await this.update({ "system.cyber.hackUses": Number(this.system.cyber?.hackUses || 0) + 1 });
    if (options.heroPoint) await this.update({ "system.heroPoint": 0 });
    if (options.consumeSatr) await this.update({ "system.conditions.satr": false });
    if (options.consumeEvasionPenalty) await this.update({ "system.conditions.nextEvasionPenalty": 0 });
    return { result, faces: best.faces, allocations: best.allocations, rolls, options };
  }

  async _postRoll(check, outcome, extra) {
    const content = this._renderRollCard(check, outcome, extra);
    const messageData = {
      speaker: ChatMessage.getSpeaker({ actor: check.speakerActor ?? this }),
      content,
      rolls: outcome.rolls,
      flags: {
        tdt: {
          reroll: check.reroll ? { actorUuid: this.uuid, method: check.reroll.method, args: check.reroll.args, options: outcome.options } : null
        }
      }
    };
    ChatMessage.applyRollMode(messageData, outcome.options.rollMode);
    return ChatMessage.create(messageData);
  }

  async rerollFromMessage(message) {
    const data = message.getFlag("tdt", "reroll");
    if (!data?.method || typeof this[data.method] !== "function") return ui.notifications.warn("Esta tirada no se puede repetir automáticamente.");
    const sources = this.items.filter(item => item.system.uses?.reroll && Number(item.system.uses.value) > 0);
    const choices = [
      ...(this.system.heroPoint ? [{ id: "hero", label: "Punto de héroe" }] : []),
      ...sources.map(item => ({ id: item.id, label: `${item.name} (${item.system.uses.value}/${item.system.uses.max})` })),
      { id: "free", label: "Repetir sin gastar recursos (decisión del DJ)" }
    ];
    const choice = await choiceDialog("Repetir tirada", "¿Qué recurso usas para repetir la tirada?", choices);
    if (!choice) return;
    if (choice === "hero") await this.update({ "system.heroPoint": 0 });
    else if (choice !== "free") {
      const item = this.items.get(choice);
      await item.update({ "system.uses.value": Math.max(0, Number(item.system.uses.value) - 1) });
    }
    const options = { ...(data.options ?? {}), heroPoint: false, consumed: [] };
    const args = foundry.utils.deepClone(data.args ?? []);
    const last = args.length ? args[args.length - 1] : null;
    if (last && typeof last === "object" && !Array.isArray(last)) last.preset = options;
    else args.push({ preset: options });
    return this[data.method](...args);
  }

  _getApplicableRules(check) {
    const scopes = new Set(check.scopes ?? []);
    const applies = currentRule => {
      if (currentRule.excludeScopes?.some(scope => scopes.has(scope))) return false;
      return !currentRule.scopes?.length || currentRule.scopes.some(scope => scopes.has(scope));
    };
    const featRules = this.items
      .filter(item => ["feat", "race", "implant", "power"].includes(item.type) && (!item.system.toggle || item.system.active))
      .filter(item => item.type !== "implant" || (item.system.installed !== false && !item.system.offline))
      .flatMap(item => {
        const list = [...(item.system.rules ?? [])];
        if (item.type === "implant") for (const upgrade of item.system.upgrades ?? []) if (upgrade.installed) list.push(...(upgrade.rules ?? []));
        return list.map(entry => ({ ...entry, label: entry.label || item.name }));
      });
    return [...featRules, ...this._statusRules(check), ...(check.extraRules ?? [])].filter(applies);
  }

  _statusRules(check) {
    const rules = [];
    const scopes = new Set(check.scopes ?? []);
    if (moduleActive("zombie") && this.type === "character") rules.push(...Zombie.zombieStatusRules(this.system));
    if (scopes.has("evasion") && Number(this.system.conditions?.nextEvasionPenalty)) {
      rules.push({ type: "penalty", value: 1, label: "Inercia de arma pesada (no se puede bonificar)", noBonus: true, consume: "evasionPenalty" });
    }
    if (this.system.conditions?.satr && (scopes.has("attack") || scopes.has("evasion"))) {
      rules.push({ type: "bonus", value: 3, label: "SATR: bonifica 3 y repite los 1", rerollOnes: true, consume: "satr" });
    }
    return rules;
  }

  _ruleLabel(entry) {
    if (entry.type === "bonus") return `bonifica en ${entry.value}`;
    if (entry.type === "penalty") return `penaliza en ${entry.value}`;
    if (entry.type === "dieStep") return entry.value > 0 ? "aumenta el dado" : entry.floorOne ? "reduce el dado (un d4 pasa a 1)" : "reduce el dado";
    if (entry.type === "disadvantage") return entry.target === "second" ? "tira dos veces la habilidad y conserva el menor" : "tira dos veces la característica y conserva el menor";
    if (entry.type === "advantage") return "tira dos veces la habilidad y conserva el mayor";
    if (entry.type === "noFumble") return "ignora la pifia";
    if (entry.type === "worseDie") return `añade 1d${entry.value || 4} y conserva los dos menores`;
    if (entry.type === "critical") return "el crítico se suma una vez más";
    if (entry.type === "extraDie") return `añade 1d${entry.value}`;
    if (entry.type === "difficulty") return entry.value > 0 ? `baja ${entry.value} la dificultad` : `sube ${-entry.value} la dificultad`;
    if (entry.type === "flat") return `${entry.value >= 0 ? "+" : ""}${entry.value} al total`;
    if (entry.type === "damage") return `Daño +${entry.value}`;
    return "recordatorio";
  }

  _rollOptionsDialog(check) {
    const stepOptions = selected => [-2, -1, 0, 1, 2]
      .map(value => `<option value="${value}" ${value === selected ? "selected" : ""}>${value > 0 ? "+" : ""}${value}</option>`)
      .join("");
    const modeOptions = Object.entries(CONFIG.Dice.rollModes)
      .map(([key, mode]) => `<option value="${key}" ${key === game.settings.get("core", "rollMode") ? "selected" : ""}>${game.i18n.localize(mode.label ?? mode)}</option>`)
      .join("");
    const allRules = this._getApplicableRules(check);
    const mechanicalRules = allRules.filter(entry => entry.type !== "reminder");
    const reminders = allRules.filter(entry => entry.type === "reminder");
    const featControls = mechanicalRules.length ? `
      <fieldset class="tdt-roll-feats"><legend>Reglas aplicables</legend>
        ${mechanicalRules.map((entry, index) => `<label ${entry.sense ? `data-rule-sense="${esc(entry.sense)}"` : ""} title="Desmarca la regla si su condición no se cumple en esta acción."><input type="checkbox" class="tdt-feat-rule" data-rule-index="${index}" ${entry.optional ? "" : "checked"}> ${esc(entry.label)} <small>(${this._ruleLabel(entry)})</small></label>`).join("")}
      </fieldset>` : "";
    const reminderControls = reminders.length ? `<details class="tdt-roll-reminders"><summary>Recordatorios</summary>${reminders.map(entry => `<p ${entry.sense ? `data-rule-sense="${esc(entry.sense)}"` : ""}><strong>${esc(entry.label)}:</strong> ${esc(entry.text)}</p>`).join("")}</details>` : "";
    const dieModifierControls = check.linkedDice
      ? `<div class="form-group"><label>Modificar ambos dados</label><select name="firstStep">${stepOptions(0)}</select></div>`
      : `<div class="form-group"><label>Modificar ${esc(check.first.label)}</label><select name="firstStep">${stepOptions(0)}</select></div>
        <div class="form-group"><label>Modificar ${esc(check.second.label)}</label><select name="secondStep">${stepOptions(0)}</select></div>`;
    const heroControl = this.type === "character" && this.system.heroPoint
      ? `<div class="form-group"><label>Gastar punto de héroe</label><input type="checkbox" name="heroPoint"><p class="hint">Bonifica en 2 sin tope.</p></div>` : "";
    const willControl = check.third?.faces
      ? `<div class="form-group"><label>Vincula voluntad (+d${check.third.faces})</label><input type="checkbox" name="linkWill"><p class="hint">Añade el dado de Voluntad del piloto; después hay que pasar el drenaje de voluntad.</p></div>` : "";
    const content = `
      <form class="tdt-roll-dialog">
        <p><strong>${esc(check.label)}</strong>${check.subtitle ? `<br><small>${esc(check.subtitle)}</small>` : ""}</p>
        ${dieModifierControls}
        <div class="form-group"><label>Bonificador disponible (+0 a +3)</label><input name="bonus" type="number" min="0" max="3" value="0"><p class="hint">Se reparte automáticamente entre los dados para obtener el mejor resultado.</p></div>
        <div class="form-group"><label>Penalizador al total</label><input name="penalty" type="number" min="0" value="0"><p class="hint">Los penalizadores no tienen el límite +3 de los bonificadores.</p></div>
        <div class="form-group tdt-difficulty-field"><label>Dificultad ${check.automaticDifficulty ? `<small><i class="fas fa-crosshairs"></i> ${esc(check.automaticDifficulty)}</small>` : "(0 = sin comparar)"}</label><input name="difficulty" type="number" min="0" value="${Number(check.difficulty || 0)}" ${check.automaticDifficulty && Number(check.difficulty) ? 'class="automatic"' : ""}></div>
        ${heroControl}
        ${willControl}
        ${check.extraFields ?? ""}
        <div class="form-group"><label>Visibilidad</label><select name="rollMode">${modeOptions}</select></div>
        ${featControls}
        ${reminderControls}
      </form>`;
    return new Promise(resolve => {
      new Dialog({
        title: `Tirada de ${check.label}`,
        content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice"></i>',
            label: "Tirar",
            callback: html => {
              const form = html[0].querySelector("form");
              const data = new FormData(form);
              const options = {
                firstStep: Number(data.get("firstStep") || 0),
                secondStep: check.linkedDice ? Number(data.get("firstStep") || 0) : Number(data.get("secondStep") || 0),
                bonus: Math.max(0, Number(data.get("bonus") || 0)),
                penalty: Math.max(0, Number(data.get("penalty") || 0)),
                difficulty: Math.max(0, Number(data.get("difficulty") || 0)),
                difficultyMod: 0,
                firstDisadvantage: false,
                secondAdvantage: false,
                secondDisadvantage: false,
                firstFloorOne: false,
                secondFloorOne: false,
                noFumble: false,
                noBonus: false,
                rerollOnes: false,
                extraDice: [],
                damageBonus: 0,
                consumed: [],
                appliedRules: [],
                linkWill: Boolean(data.get("linkWill")),
                heroPoint: Boolean(data.get("heroPoint")),
                rollMode: data.get("rollMode"),
                extra: check.readExtra ? check.readExtra(form, data) : {}
              };
              for (const input of form.querySelectorAll(".tdt-feat-rule:checked")) {
                const entry = mechanicalRules[Number(input.dataset.ruleIndex)];
                if (entry.sense && entry.sense !== options.extra?.perceptionSense) continue;
                applyRuleToOptions(entry, options, check);
              }
              // Hero point and SATR only affect the first roll; later attacks of a multiple attack use followUpBonus.
              options.followUpBonus = options.noBonus ? 0 : Math.min(3, Math.max(0, options.bonus - Number(options.satrBonus || 0)));
              options.bonus = options.noBonus ? 0 : Math.min(3, options.bonus) + (options.heroPoint ? 2 : 0);
              if (options.difficulty) options.difficulty = Math.max(0, options.difficulty - options.difficultyMod);
              resolve(options);
            }
          },
          cancel: { label: "Cancelar", callback: () => resolve(null) }
        },
        default: "roll",
        render: html => {
          const root = html[0];
          const select = root.querySelector('[name="perceptionSense"]');
          if (!select) return;
          const update = () => {
            for (const label of root.querySelectorAll("[data-rule-sense]")) label.hidden = label.dataset.ruleSense !== select.value;
          };
          select.addEventListener("change", update);
          update();
        },
        close: () => resolve(null)
      }, { classes: ["tdt", "tdt-dialog"] }).render(true);
    });
  }

  _renderRollCard(check, outcome, extra) {
    const { result, faces, allocations } = outcome;
    const state = result.isFumble ? "PIFIA" : result.isCritical ? "CRÍTICO" : result.success === true ? "ÉXITO" : result.success === false ? "FALLO" : "";
    const stateClass = result.isFumble ? "fumble" : result.isCritical ? "critical" : result.success === true ? "success" : result.success === false ? "failure" : "";
    const dieText = (index, label) => {
      if (!faces[index]) return `<span>${label ?? "+1"}</span>`;
      const name = index === 0 ? check.first?.label : index === 1 ? check.second?.label : "Extra";
      return `<span>${name ? `<em class="tdt-die-name">${esc(name)}</em>` : ""}d${faces[index]}: <strong>${result.rawResults[index]}</strong>${allocations[index] ? ` + ${allocations[index]} = <strong>${result.adjusted[index]}</strong>` : ""}</span>`;
    };
    const bonusSpent = allocations.reduce((sum, value) => sum + value, 0);
    const alternatives = result.alternatives ? `<div class="tdt-roll-note">Pilotos: ${result.alternatives.map(entry => `${esc(entry.label)} d${entry.faces}: ${entry.value}`).join(" · ")} — se usa <strong>${esc(result.chosen)}</strong></div>` : "";
    const rerollButton = check.reroll ? `<button type="button" class="tdt-chat-button small" data-tdt-action="reroll" title="Repetir tirada"><i class="fas fa-rotate"></i></button>` : "";
    return `
      <div class="tdt-chat-card">
        <header>${esc(check.label)}${rerollButton}</header>
        ${check.subtitle ? `<div class="tdt-roll-note">${esc(check.subtitle)}</div>` : ""}
        ${check.senseLabels?.[outcome.options.extra?.perceptionSense] ? `<div class="tdt-roll-note">Tipo: ${esc(check.senseLabels[outcome.options.extra.perceptionSense])}</div>` : ""}
        <div class="tdt-dice-line">${dieText(0)}${dieText(1, "+1 sin habilidad")}${faces.length > 2 ? dieText(2) : ""}</div>
        ${alternatives}
        ${bonusSpent ? `<div class="tdt-auto-bonus"><i class="fas fa-wand-magic-sparkles"></i> Bono repartido automáticamente: +${bonusSpent}</div>` : ""}
        ${result.extraResults?.length ? `<div>Dados extra: ${result.extraResults.map(entry => `d${entry.faces}: ${entry.value}`).join(", ")}</div>` : ""}
        ${result.criticalBonus ? `<div>Crítico: +${result.criticalBonus}</div>` : ""}
        ${result.penalty ? `<div>Penalizador: −${result.penalty}</div>` : ""}
        <div class="tdt-roll-total">${result.total}</div>
        ${result.difficulty ? `<div>Dificultad ${result.difficulty}${result.margin !== null ? ` (margen ${result.margin >= 0 ? "+" : ""}${result.margin})` : ""}</div>` : ""}
        ${state ? `<div class="tdt-roll-state ${stateClass}">${state}</div>` : ""}
        ${outcome.options.appliedRules?.length ? `<div class="tdt-roll-note">Reglas: ${outcome.options.appliedRules.map(esc).join(", ")}</div>` : ""}
        ${extra?.html ?? ""}
      </div>`;
  }

  /* -------------------------------------------- */
  /*  Weapons and attacks                          */
  /* -------------------------------------------- */

  weaponProfile(item) {
    const category = this.type === "mecha" ? this.system.category : 1;
    return weaponProfile(item, this, { rule, moduleActive, mechaCategory: category });
  }

  async rollWeapon(item, options = {}) {
    if (typeof item === "string") item = this.items.get(item);
    if (!item) return null;
    if (this.type === "npc") return this.npcAttack(item, options);
    if (this.type === "mecha") return this.rollMechaWeapon(item, options);
    const profile = this.weaponProfile(item);
    if (profile.broken) return ui.notifications.warn(`${item.name} está rota y no funciona hasta que se repare.`);
    const tracksAmmo = Number(item.system.ammo?.max || 0) > 0;
    if (!options.preset && tracksAmmo && Number(item.system.ammo.value) <= 0) {
      ui.notifications.warn(`${item.name} no tiene munición.`);
      return null;
    }
    const consumable = profile.props.consumable;
    if (!options.preset && consumable && Number(item.system.quantity ?? 1) <= 0) {
      ui.notifications.warn(`No te quedan ${item.name}.`);
      return null;
    }
    const skillKey = item.system.skill;
    const skill = this.system.skills[skillKey];
    const attributeKey = await this._weaponAttribute(item, skill, options);
    if (!attributeKey) return null;
    const attribute = this.system.attributes[attributeKey];
    const extraRules = [...profile.optionalRules];
    if (profile.bonus) extraRules.push({ type: "bonus", value: profile.bonus, label: `${item.name}: mejoras` });
    if (profile.penalty) extraRules.push({ type: "penalty", value: profile.penalty, label: `${item.name}: penalizador del arma` });
    if (profile.powerDifficulty) extraRules.push({ type: "difficulty", value: -profile.powerDifficulty, label: `Potencia insuficiente (d${profile.props.powerRequired})` });
    if (skill?.chipBonus) extraRules.push({ type: "bonus", value: 1, label: "Chip de habilidad (d12)" });
    if (!options.preset && warnIfAllImmune(currentTargets(), item.system.defense || "evasion")) return null;
    const terror = options.preset ? 0 : await this._terrorCheck();
    if (terror === false) return null;
    if (terror) extraRules.push({ type: "penalty", value: terror, label: "Terror" });
    const defenseKey = item.system.defense || "evasion";
    const targets = currentTargets();
    const singleDefense = targets.length === 1 ? targetDefense(targets[0], defenseKey) : null;
    const secondFaces = skill?.value ?? 0;
    const maxAttacks = profile.props.singleAttack ? 1 : Math.max(1, secondFaces ? [4, 6, 8, 10, 12].indexOf(secondFaces) + 1 : 1);
    const extraFields = [
      maxAttacks > 1 ? `<div class="form-group"><label>Número de ataques</label><select name="attacks">${Array.from({ length: maxAttacks }, (_, i) => `<option value="${i + 1}">${i + 1}${i ? ` (habilidad −${i})` : ""}</option>`).join("")}</select></div>` : "",
      profile.pointBlank ? `<div class="form-group"><label>A quemarropa (distancia corta o menos): Daño ${profile.pointBlank}</label><input type="checkbox" name="pointBlank"></div>` : "",
      profile.area ? `<div class="form-group"><label>Ataque de área (Área ${profile.area} como Daño)</label><input type="checkbox" name="area"></div>` : "",
      profile.concentrated ? `<p class="hint">Golpe concentrado: con un solo ataque, Daño ${profile.concentrated}.</p>` : "",
      targets.length ? `<p class="hint">Objetivos: ${targets.map(target => esc(target.name)).join(", ")}${singleDefense !== null ? ` (${TDT.attackDefenses[defenseKey] ?? defenseKey} ${singleDefense})` : ""}.</p>` : ""
    ].join("");
    const scopes = [skillKey, attributeKey, "attack", profile.isMelee ? "melee-attack" : "ranged-attack", ...(skillKey === "brawl" ? ["unarmed"] : [])];
    const baseCheck = {
      kind: "weapon",
      label: `Ataque: ${item.name}`,
      scopes,
      primaryScope: attributeKey,
      secondaryScope: skillKey,
      first: { label: attribute?.label ?? "Característica", faces: attribute?.value ?? 4 },
      second: { label: skill?.label ?? "Habilidad", faces: secondFaces },
      difficulty: singleDefense ?? 0,
      automaticDifficulty: automaticDifficultyText(targets, defenseKey),
      extraRules,
      extraFields,
      readExtra: (form, data) => ({ attacks: Number(data.get("attacks") || 1), pointBlank: Boolean(data.get("pointBlank")), area: Boolean(data.get("area")) })
    };
    const rollOptions = options.preset ?? await this._rollOptionsDialog(baseCheck);
    if (!rollOptions) return null;
    const attacks = Math.max(1, Math.min(maxAttacks, Number(rollOptions.extra?.attacks || 1)));
    let lastResult = null;
    for (let attack = 0; attack < attacks; attack++) {
      if (!options.preset && tracksAmmo && Number(item.system.ammo.value) <= 0) {
        ui.notifications.warn(`${item.name} se ha quedado sin munición.`);
        break;
      }
      const followUp = attack > 0;
      const attackOptions = {
        ...rollOptions,
        secondStep: rollOptions.secondStep - (attacks - 1),
        consumed: followUp ? [] : rollOptions.consumed,
        heroPoint: followUp ? false : rollOptions.heroPoint,
        consumeSatr: followUp ? false : rollOptions.consumeSatr,
        ...(followUp ? { bonus: rollOptions.followUpBonus ?? rollOptions.bonus, rerollOnes: Boolean(rollOptions.followUpRerollOnes) } : {})
      };
      const check = {
        ...baseCheck,
        label: attacks > 1 ? `Ataque ${attack + 1}/${attacks}: ${item.name}` : baseCheck.label,
        reroll: { method: "rollWeapon", args: [item.id, { attribute: attributeKey }] },
        after: outcome => this._weaponAfter(item, profile, outcome, { attacks, defenseKey, targets, reroll: Boolean(options.preset) })
      };
      lastResult = await this.rollCheck(check, attackOptions);
      if (tracksAmmo && !options.preset) await item.update({ "system.ammo.value": Math.max(0, Number(item.system.ammo.value) - 1) });
      // Grenades and other consumables are spent when thrown.
      if (consumable && !options.preset && lastResult) {
        await item.update({ "system.quantity": Math.max(0, Number(item.system.quantity ?? 1) - 1) });
        if (Number(item.system.quantity) <= 0) break;
      }
    }
    return lastResult;
  }

  /** Weapons of "Potencia o Destreza" let the player choose (no question when both dice are equal). */
  async _weaponAttribute(item, skill, options = {}) {
    const main = item.system.attribute || skill?.attribute || "power";
    const alt = item.system.attributeAlt;
    if (options.attribute && this.system.attributes[options.attribute]) return options.attribute;
    if (!alt || alt === main || !this.system.attributes[alt]) return main;
    const dice = key => Number(this.system.attributes[key].value) || 4;
    if (dice(main) === dice(alt)) return main;
    const order = dice(alt) > dice(main) ? [alt, main] : [main, alt];
    return choiceDialog(`Ataque: ${item.name}`, "¿Con qué característica atacas?", order.map(key => ({ id: key, label: `${this.system.attributes[key].label} (d${dice(key)})` })));
  }

  /** Refills a weapon up to its effective magazine (Bruta halves it, Cargador de doble fondo doubles it). */
  async reloadWeapon(itemRef) {
    const item = typeof itemRef === "string" ? this.items.get(itemRef) : itemRef;
    if (!item || item.type !== "weapon" || !Number(item.system.ammo?.max)) return null;
    const max = Math.max(0, Number(this.weaponProfile(item).ammoMax) || 0);
    await item.update({ "system.ammo.value": max });
    const quick = rule("weaponUpgrades") && (item.system.upgrades?.basic ?? []).includes("quickReload");
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="tdt-chat-card"><header>Recarga: ${esc(item.name)}</header><p>Munición ${max}/${max}. ${quick ? "Recargador rápido: solo gasta el equivalente a un ataque múltiple." : "Gasta el turno."}</p></div>`
    });
  }

  async _weaponAfter(item, profile, outcome, { attacks, defenseKey, targets, reroll = false }) {
    const { result, options } = outcome;
    const extra = options.extra ?? {};
    let damage = profile.damage + Number(options.damageBonus || 0);
    if (extra.pointBlank && profile.pointBlank) damage = profile.pointBlank + Number(options.damageBonus || 0);
    if (attacks === 1 && profile.concentrated && !extra.pointBlank) damage = profile.concentrated + Number(options.damageBonus || 0);
    if (extra.area && profile.area) damage = profile.area + Number(options.damageBonus || 0);
    if (attacks > 1 && profile.special === "leadRain") damage += 1;
    const notes = [...profile.notes];
    // Ganador del torneo del puño de hierro: desarmado y sin ataque múltiple, Daño = puntuación de Potencia.
    if (this.tdtFlags.has("ironFist") && item.system.skill === "brawl" && attacks === 1) {
      const score = dieScore(this.system.attributes?.power?.value ?? this.system.attributes?.power?.die);
      if (score > profile.damage) {
        damage += score - profile.damage;
        notes.push(`Puño de hierro: Daño ${score} (puntuación de Potencia).`);
      }
    }
    const lines = [];
    const delta = profile.damage - Number(item.system.damage || 0);
    for (const target of targets) {
      const defense = targetDefense(target, defenseKey);
      const isMachine = target.type === "mecha" || target.system.npcStats?.machine;
      let targetDamage = damage;
      if (isMachine && profile.props.vsMachines) targetDamage = profile.props.vsMachines + delta;
      if (!isMachine && profile.props.vsLiving) targetDamage = profile.props.vsLiving + delta;
      // Guerrero: ignora 1 punto de aguante de los enemigos.
      const endurance = Math.max(0, targetEndurance(target, { shot: profile.isFirearm }) - (this.tdtFlags.has("warrior") ? 1 : 0));
      lines.push(this._targetLine(target, { total: result.total, difficultyMod: result.difficultyMod, defense, damage: targetDamage, endurance, minimum: profile.minimumDamage, defenseKey, isFumble: result.isFumble, options: { raw: true, area: Boolean(extra.area), stun: profile.props.stun, armorBreak: profile.props.armorBreaker, attackerFlags: [...this.tdtFlags] } }));
    }
    if (profile.props.stun) notes.push(`Aturdidora ${profile.props.stun}: si inflige ${profile.props.stun} o más, el objetivo pierde su próximo turno.`);
    if (profile.props.contusion) notes.push(`Contusión ${profile.props.contusion}: con ${profile.props.contusion} o más de daño, penalización severa (DJ).`);
    if (profile.props.armorBreaker) notes.push("Rompearmaduras: cada golpe que hace daño quita 1 de aguante a la armadura.");
    const missed = result.success === false || (targets.length && lines.every(line => !line.hit));
    if (!reroll && profile.general === "heavy" && missed) {
      await this.update({ "system.conditions.nextEvasionPenalty": 1 });
      notes.push("Has fallado con un arma Pesada: tu siguiente Esquiva penaliza 1 y no se puede bonificar.");
    }
    if (!reroll && result.isFumble && rule("weaponCondition")) notes.push(await this._degradeWeapon(item));
    let selfButton = "";
    if (profile.selfDamage) selfButton = `<button type="button" class="tdt-chat-button" data-tdt-action="self-damage" data-payload="${payload({ actorUuid: this.uuid, amount: profile.selfDamage })}">Retroceso: recibir ${profile.selfDamage} de daño</button>`;
    const html = `
      <div class="tdt-roll-weapon"><strong>Daño:</strong> ${damage} · ${esc(item.system.properties || "Sin propiedades")}</div>
      ${lines.map(line => line.html).join("")}
      ${notes.length ? `<ul class="tdt-roll-notes">${notes.filter(Boolean).map(note => `<li>${esc(note)}</li>`).join("")}</ul>` : ""}
      ${selfButton}`;
    return { html };
  }

  /** One line of a chat card showing the result against a target, with an apply button. */
  _targetLine(target, { total, defense, damage, endurance, minimum = 0, afterEndurance = 0, defenseKey = "evasion", options = {}, label = "", difficultyMod = 0 }) {
    const mod = Number(difficultyMod || 0);
    if (mod && defense !== null && defense !== undefined) defense = Math.max(0, Number(defense) - mod);
    const defenseLabel = TDT.hackDefenses[defenseKey] ?? TDT.attackDefenses[defenseKey] ?? defenseKey;
    if (targetImmune(target, defenseKey)) {
      return { hit: false, html: `<div class="tdt-target-line miss"><strong>${esc(target.name)}</strong>: ${esc(defenseLabel)} «-», es inmune.</div>` };
    }
    if (defense === null || defense === undefined) {
      if (target.type === "character") {
        const data = { attackValue: total + mod, damage, defense: defenseKey, attackerUuid: this.uuid, attackerName: this.name, options };
        return { hit: null, html: `<div class="tdt-target-line"><strong>${esc(target.name)}</strong>: tirada enfrentada. <button type="button" class="tdt-chat-button" data-tdt-action="defend" data-payload="${payload(data)}">Defenderse (${esc(defenseLabel)})</button></div>` };
      }
      return { hit: null, html: `<div class="tdt-target-line"><strong>${esc(target.name)}</strong>: sin valor de ${esc(defenseLabel)} (lo decide el DJ).</div>` };
    }
    const outcome = finalDamage({ total, defense, damage, endurance, minimum, afterEndurance });
    if (!outcome.hit) return { hit: false, html: `<div class="tdt-target-line miss"><strong>${esc(target.name)}</strong>: ${esc(defenseLabel)} ${defense} — falla.</div>` };
    const button = `<button type="button" class="tdt-chat-button" data-tdt-action="apply-damage" data-payload="${payload({ targetUuid: target.uuid, amount: outcome.damage, options })}">Aplicar ${outcome.damage}</button>`;
    return {
      hit: true,
      incoming: outcome.incoming,
      damage: outcome.damage,
      html: `<div class="tdt-target-line hit"><strong>${esc(target.name)}</strong>: ${esc(defenseLabel)} ${defense} — acierta. Entrante ${outcome.incoming} + Daño ${damage}${afterEndurance ? ` (+${afterEndurance} tras aguante)` : ""} − Aguante ${endurance} = <strong>${outcome.damage}</strong>${label ? ` · ${esc(label)}` : ""} ${button}</div>`
    };
  }

  async _degradeWeapon(item) {
    const order = TDT.weaponConditionOrder;
    const flags = this.tdtFlags;
    const current = item.system.condition || "normal";
    if (flags.has("weaponSaver")) {
      const roll = await new Roll("1d4").evaluate();
      if (roll.total === 4) return `Pifia: Reparador de armas (d4 = 4), ${item.name} no se deteriora.`;
    }
    const next = flags.has("weaponBreaker") ? "broken" : order[Math.max(0, order.indexOf(current) - 1)];
    await item.update({ "system.condition": next });
    return `Pifia: ${item.name} pasa a estar ${TDT.weaponConditions[next].toLocaleLowerCase("es")}.`;
  }

  async _terrorCheck() {
    if (!moduleActive("zombie") || !rule("zombieTerror") || !this.system.zombie?.terror?.active) return 0;
    const terror = this.system.zombie.terror;
    const result = await this.rollDefense("will", {
      label: `Terror: ${terror.source || "pánico"}`,
      difficulty: Number(terror.difficulty || 5),
      extraRules: terror.hidden ? [{ type: "bonus", value: 1, label: "La fuente del terror no está a la vista" }] : []
    });
    if (!result) return false;
    if (result.isFumble) {
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>Terror</header><p>${esc(this.name)} lo abandona todo e intenta huir o esconderse.</p></div>` });
      return false;
    }
    return result.success ? 0 : Math.min(3, Math.max(0, result.difficulty - result.total));
  }

  /** Enemies attack with a fixed number; the character defends from the chat card. */
  async npcAttack(item, options = {}) {
    const props = parseWeaponProperties(item.system.properties);
    const hackDefense = item.system.hackDefense || "";
    let difficulty = Number(item.system.attackDifficulty || 0);
    const notes = [];
    const group = this.system.zombie?.group;
    if (group && group.size > 1) {
      difficulty += group.attackBonus;
      notes.push(`Grupo de ${group.remaining} zombis: +${group.attackBonus} a la dificultad. El turno del grupo es un intento de agarre y un ataque al mismo jugador.`);
    }
    const reduction = Number(rule("enemyMultiAttack")) || 2;
    const maxAttacks = props.singleAttack ? 1 : Array.from({ length: 3 }, (_, i) => i + 1).filter(n => n === 1 || difficulty - reduction * (n - 1) >= 3).length;
    let attacks = 1;
    if (maxAttacks > 1 && !options.preset) {
      const choice = await choiceDialog(`Ataque: ${item.name}`, "Número de ataques", Array.from({ length: maxAttacks }, (_, i) => ({ id: String(i + 1), label: `${i + 1} (dificultad ${difficulty - reduction * i})` })));
      if (!choice) return null;
      attacks = Number(choice);
    }
    const value = difficulty - reduction * (attacks - 1);
    const defense = hackDefense || item.system.defense || "evasion";
    // Armas solo de área (misiles…): el Área hace de Daño.
    const areaOnly = !Number(item.system.damage || 0) && Number(props.area || 0) > 0;
    const damage = areaOnly ? Number(props.area) : Number(item.system.damage || 0);
    if (areaOnly) notes.push(`Ataque de área: Área ${props.area} como Daño a todos los que estén en la zona.`);
    const hackOptions = hackDefense ? { hack: true } : {};
    const data = { attackValue: value, fixed: true, attacks, damage, vsLiving: props.vsLiving, vsMachines: props.vsMachines, defense, attackerUuid: this.uuid, attackerName: this.name, weaponName: item.name, options: { area: areaOnly, stun: props.stun, armorBreak: props.armorBreaker, shot: !["melee", "brawl"].includes(item.system.skill) && /munici|bater/i.test(item.system.properties), ...hackOptions } };
    const defenseLabel = TDT.hackDefenses[defense] ?? defense;
    const content = `<div class="tdt-chat-card"><header>Ataque: ${esc(item.name)}${attacks > 1 ? ` ×${attacks}` : ""}</header>
      <div class="tdt-roll-total">${value}</div><div>Dificultad del ${hackDefense ? "hack" : "ataque"} · se defiende con ${esc(defenseLabel)}</div>
      <div class="tdt-roll-weapon"><strong>Daño:</strong> ${damage} · ${esc(item.system.properties || "Sin propiedades")}</div>
      ${notes.map(note => `<div class="tdt-roll-note">${esc(note)}</div>`).join("")}
      ${["none", "gm"].includes(defense) ? "" : `<button type="button" class="tdt-chat-button" data-tdt-action="defend" data-payload="${payload(data)}">${attacks > 1 ? `Defenderse (${attacks} veces)` : "Defenderse"}</button>`}
    </div>`;
    if (Number(item.system.ammo?.max || 0) > 0) await item.update({ "system.ammo.value": Math.max(0, Number(item.system.ammo.value) - attacks) });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
  }

  /** The player rolls its defense against an attack value; ties favour the attacker. A multiple attack is defended once per attack. */
  async defendAgainst(data) {
    const count = Math.max(1, Math.min(10, Math.floor(Number(data.attacks) || 1)));
    for (let index = 0; index < count; index++) {
      const done = await this._defendOnce(data, count > 1 ? ` (${index + 1}/${count})` : "");
      // Cancelar antes de la primera defensa no gasta el botón; a medias, sí.
      if (done === null) return index > 0 ? true : null;
    }
    return true;
  }

  async _defendOnce(data, suffix = "") {
    const defense = data.defense || "evasion";
    const options = data.options ?? {};
    const isHack = Boolean(options.hack);
    if (isHack && this.tdtFlags.has("animal")) {
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>${esc(this.name)}: Animal</header><p>No tiene VirtualSelf: el hack no le afecta. Si el hack actúa directamente sobre sus implantes, lo decide el DJ.</p></div>` });
    }
    const rollOptions = { label: `Defensa contra ${data.weaponName ?? data.attackerName ?? "ataque"}${suffix}`, difficulty: Number(data.attackValue) + 1, scopes: isHack ? ["hack-defense"] : [] };
    let result;
    if (this.type === "mecha") result = await this.rollMechaStat(defense === "fortitude" ? "robustness" : "maneuver", rollOptions);
    else if (isHack) result = await this.rollHackDefense(defense, rollOptions);
    else if (defense === "perception") result = await this.rollPerception(rollOptions);
    else result = await this.rollDefense(defense, rollOptions);
    if (!result) return null;
    const attackValue = Number(data.attackValue);
    // Una regla que baja la dificultad de esquivar cuenta como sumar ese valor a la defensa.
    const defenseTotal = result.total + Number(result.difficultyMod || 0);
    if (defenseTotal > attackValue && !result.isFumble) {
      return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>${esc(this.name)} se defiende</header><p>${defenseTotal} supera ${attackValue}: el ataque falla.</p></div>` });
    }
    const incoming = Math.max(0, attackValue - defenseTotal);
    // Pifia defendiendo: el daño ignora el aguante.
    const endurance = result.isFumble ? 0 : targetEndurance(this, { hack: isHack, shot: options.shot });
    // Weapons with a special damage against living beings or machines (Hoja vibrante, Porra eléctrica…).
    const isMachine = this.type === "mecha";
    let weaponDamage = Number(data.damage || 0);
    if (isMachine && Number(data.vsMachines)) weaponDamage = Number(data.vsMachines);
    if (!isMachine && Number(data.vsLiving)) weaponDamage = Number(data.vsLiving);
    const damage = Math.max(0, incoming + weaponDamage - endurance);
    const lines = [`Entrante ${incoming} + Daño ${weaponDamage} − Aguante ${endurance}${result.isFumble ? " (pifia defendiendo: ignora el aguante)" : ""} = <strong>${damage}</strong>`];
    if (options.stun && damage >= options.stun) {
      if (this.tdtFlags.has("noStun") || this.items.some(item => item.type === "armor" && item.system.equipped && item.system.noStun)) lines.push("El traje aislante evita el aturdimiento.");
      else {
        lines.push("¡Aturdido! Pierdes tu próximo turno.");
        await this.toggleStatusEffect?.("stun", { active: true });
      }
    }
    if (result.isFumble && moduleActive("cyber")) {
      const pristine = this.items.find(item => item.type === "armor" && item.system.equipped && item.system.pristine);
      if (pristine) {
        await pristine.update({ "system.pristine": false });
        lines.push(`${pristine.name} deja de estar impoluta.`);
      }
      if (this.items.some(item => item.type === "implant" && item.system.installed !== false)) lines.push("Golpe crítico: el DJ puede dejar averiado uno de tus implantes.");
    }
    if (options.armorBreak && damage > 0) {
      const armor = this.items.find(item => item.type === "armor" && item.system.equipped && Number(item.system.endurance) - Number(item.system.damage || 0) > 0);
      if (armor) {
        await armor.update({ "system.damage": Number(armor.system.damage || 0) + 1 });
        lines.push(`Rompearmaduras: ${armor.name} pierde 1 de aguante.`);
      }
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>${esc(this.name)} recibe el golpe</header><p>${lines.join("<br>")}</p></div>` });
    if (damage > 0) await this.applyDamage(damage, { raw: true, fumble: result.isFumble });
    else if (result.isFumble && this.type === "mecha") await this._mechaDamageCheck(0, { fumble: true });
  }

  /* -------------------------------------------- */
  /*  Damage, falling and dying                    */
  /* -------------------------------------------- */

  async applyDamage(incoming, options = {}) {
    let damage;
    if (options.raw) damage = Math.max(0, Number(incoming) || 0);
    else {
      const endurance = options.ignoreEndurance ? 0 : targetEndurance(this, { hack: options.hack, shot: options.shot });
      damage = Math.max(0, Number(incoming) - endurance);
    }
    const notes = [];
    const flags = this.tdtFlags;
    if (flags.has("pupas") && damage > 0) damage += 1;
    const group = this.system.zombie?.group;
    if (group && group.size > 1) {
      const attackerFlags = new Set(options.attackerFlags ?? []);
      if (options.area) {
        damage += group.areaBonus + (attackerFlags.has("splitDamage") ? 3 : 0);
        notes.push(`Ataque de área contra el grupo: +${group.areaBonus}.`);
      } else {
        const cap = group.damageCap * (attackerFlags.has("splitDamage") ? 2 : 1);
        if (damage > cap) notes.push(`Un ataque que no es de área solo quita ${cap} a un grupo de zombis.`);
        damage = Math.min(damage, cap);
      }
    }
    if (this.type === "npc" && options.armorBreak && damage > 0) notes.push("Rompearmaduras: el DJ reduce en 1 el aguante de armadura del objetivo.");
    if (this.type === "npc" && options.stun && damage >= options.stun) {
      notes.push(`${this.name} queda aturdido: pierde su próximo turno.`);
      await this.toggleStatusEffect?.("stun", { active: true });
    }
    const before = Number(this.system.health.value);
    const health = Math.max(0, before - damage);
    await this.update({ "system.health.value": health });
    if (notes.length) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>${esc(this.name)}</header><p>${notes.map(esc).join("<br>")}</p></div>`, whisper: ChatMessage.getWhisperRecipients("GM") });
    if (this.type === "mecha") await this._mechaDamageCheck(damage, { fumble: Boolean(options.fumble) });
    if (this.type === "character" && health === 0 && damage > 0) await this._fallDown(damage - before, options);
    return damage;
  }

  async _fallDown(leftover, options = {}) {
    const difficulty = Math.max(0, leftover);
    // With 0 or 1 left over the character is already stable: unconscious at 0 HP, no dying rolls.
    if (difficulty <= 1) {
      await this.update({ "system.dying.active": false, "system.dying.difficulty": 0 });
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        content: `<div class="tdt-chat-card"><header>${esc(this.name)} cae</header><p>Queda inconsciente y suelta lo que tenga en las manos. Daño sobrante: ${difficulty}, así que está <strong>estabilizado</strong>: no hace tiradas de caído.</p></div>`
      });
    }
    await this.update({ "system.dying.active": true, "system.dying.difficulty": difficulty });
    const buttons = [`<button type="button" class="tdt-chat-button" data-tdt-action="dying" data-actor-uuid="${this.uuid}">Tirada de caído (Fortaleza ${difficulty})</button>`];
    const orc = this.items.find(item => item.type === "race" && (item.system.modifiers ?? []).some(entry => entry.target === "flag.orcSurvive") && Number(item.system.uses?.value) > 0);
    if (orc) buttons.push(`<button type="button" class="tdt-chat-button" data-tdt-action="orc-survive" data-actor-uuid="${this.uuid}" data-payload="${payload({ itemId: orc.id })}">Aguante orco (una vez al día)</button>`);
    const backup = this.items.find(item => item.type === "implant" && item.system.supreme?.enabled && item.system.supreme.kind === "backup" && !item.system.supreme.used);
    const backupNote = backup ? "<p>Si muere, la <strong>Copia de seguridad</strong> puede devolverle a la vida (úsala desde la ficha).</p>" : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="tdt-chat-card"><header>${esc(this.name)} cae</header><p>Queda inconsciente y suelta lo que tenga en las manos. Daño sobrante: ${difficulty}. Cada turno tira Fortaleza: si la supera, la dificultad baja 2; si falla, sube 2. Con 0–1 se estabiliza; con 10–11 muere.</p><p><em>Última voluntad:</em> en un momento clave puede hacer una última acción con el mayor crítico posible y morir después.</p>${backupNote}${buttons.join("")}</div>`
    });
  }

  async rollDying() {
    const dying = this.system.dying;
    if (!dying?.active) return ui.notifications.info(`${this.name} no está caído.`);
    const extraRules = [];
    if (this.items.some(item => item.type === "implant" && item.system.installed !== false && !item.system.offline && (item.system.modifiers ?? []).some(entry => entry.target === "flag.marrowDeath"))) {
      extraRules.push({ type: "difficulty", value: 2, label: "Médula ósea acelerada" });
    }
    extraRules.push({ type: "difficulty", value: 2, label: "Asistencia médica (si la supera, se estabiliza)", optional: true, medical: true });
    let medical = false;
    const result = await this.rollDefense("fortitude", {
      label: "Tirada de caído",
      difficulty: Number(dying.difficulty || 0),
      extraRules,
      after: outcome => {
        medical = outcome.options.appliedRules?.some(label => label.startsWith("Asistencia médica"));
        return null;
      }
    });
    if (!result) return;
    let difficulty = Number(dying.difficulty || 0) + (result.success ? -2 : 2);
    let text;
    if (result.success && medical) difficulty = 0;
    if (difficulty <= 1) {
      text = `${this.name} se estabiliza.`;
      await this.update({ "system.dying.active": false, "system.dying.difficulty": 0 });
    } else if (difficulty >= 10) {
      text = `${this.name} ha muerto.`;
      await this.update({ "system.dying.active": false, "system.dying.difficulty": difficulty });
    } else {
      text = `Dificultad de la próxima tirada de caído: ${difficulty}.`;
      await this.update({ "system.dying.difficulty": difficulty });
    }
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>Caído</header><p>${esc(text)}</p></div>` });
  }

  async orcSurvive({ itemId }) {
    const item = this.items.get(itemId);
    if (!item || Number(item.system.uses?.value) <= 0) return;
    const difficulty = await numberDialog("Aguante orco", "Dificultad del golpe recibido", 6);
    if (difficulty === null) return;
    const result = await this.rollDefense("fortitude", { label: "Aguante orco", difficulty: difficulty + 1 });
    if (!result) return;
    await item.update({ "system.uses.value": Number(item.system.uses.value) - 1 });
    if (result.total > difficulty) {
      await this.update({ "system.health.value": 1, "system.dying.active": false, "system.dying.difficulty": 0 });
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>Aguante orco</header><p>${esc(this.name)} se niega a caer y queda a 1 PV.</p></div>` });
    }
  }

  async fallDamage() {
    const meters = await numberDialog("Daño por caída", "Metros de caída", 3);
    if (meters === null) return;
    const flags = this.tdtFlags;
    const ignored = flags.has("legsReinforced") ? 12 : flags.has("legs") ? 6 : 0;
    let effective = Math.max(0, meters - ignored);
    let landingText = "No intenta amortiguar la caída con Acrobacias.";
    if (effective > 0) {
      const landing = await choiceDialog("Daño por caída", "¿Quieres intentar amortiguar la caída? Fallar Acrobacias aumenta el daño según la diferencia contra dificultad 8.", [
        { id: "direct", label: "No tirar Acrobacias" },
        { id: "acrobatics", label: "Intentar aterrizar (Destreza + Acrobacias)" }
      ]);
      if (!landing) return;
      if (landing === "acrobatics") {
        const result = await this.rollSkill("acrobatics", { attribute: "dexterity", label: "Aterrizar (Acrobacias)", difficulty: 8 });
        if (!result) return;
        if (result.success) {
          const reduction = 2 * (result.total - 8);
          effective = Math.max(0, effective - reduction);
          landingText = `Aterrizaje ${result.total} contra 8: reduce ${reduction} m efectivos.`;
        } else {
          const increase = Math.max(0, 8 - result.total);
          effective += increase;
          landingText = `Aterrizaje fallido ${result.total} contra 8: suma ${increase} m efectivos.`;
        }
      }
    } else landingText = "La protección ignora toda la distancia de caída.";
    const damage = Math.max(0, effective - Number(this.system.endurance.natural ?? this.system.endurance.base ?? 0));
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>Caída de ${meters} m</header><p>${ignored ? `Piernas cibernéticas: los primeros ${ignored} m no cuentan.<br>` : ""}${esc(landingText)}<br>Metros efectivos: ${effective}. Daño tras el aguante natural: <strong>${damage}</strong>.</p></div>` });
    if (damage > 0) await this.applyDamage(damage, { raw: true });
  }

  /* -------------------------------------------- */
  /*  Rest, scenes and resources                   */
  /* -------------------------------------------- */

  _restDialog() {
    return new Promise(resolve => {
      new Dialog({
        title: `Descansar: ${this.name}`,
        content: `<form>
          <p>Descansar cura 1 PV y recupera maná, energía y usos diarios.</p>
          <div class="form-group"><label>Alguien te trata las heridas (+1 PV)</label><input type="checkbox" name="treated"></div>
          <div class="form-group"><label>Quien te trata tiene Manos sanadoras (+1 PV)</label><input type="checkbox" name="healerHands"></div>
        </form>`,
        buttons: {
          ok: { icon: '<i class="fas fa-bed"></i>', label: "Descansar", callback: html => {
            const form = html[0].querySelector("form");
            resolve({ treated: form.treated.checked, healerHands: form.healerHands.checked });
          } },
          cancel: { label: "Cancelar", callback: () => resolve(null) }
        },
        default: "ok",
        render: html => {
          const form = html[0].querySelector("form");
          const sync = () => {
            form.healerHands.disabled = !form.treated.checked;
            if (!form.treated.checked) form.healerHands.checked = false;
          };
          form.treated.addEventListener("change", sync);
          sync();
        },
        close: () => resolve(null)
      }, { classes: ["tdt", "tdt-dialog"] }).render(true);
    });
  }

  /**
   * Long rest. Heals 1 PV, +1 if someone treats you and +1 more if that person has Manos sanadoras.
   * @param {{treated?: boolean, healerHands?: boolean}} [options] Skips the dialog when given.
   */
  async rest(options) {
    const care = (options && typeof options === "object") ? options : await this._restDialog();
    if (!care) return null;
    const treated = Boolean(care.treated);
    const healerHands = treated && Boolean(care.healerHands);
    const updates = {};
    const lines = [];
    const health = Number(this.system.health.value || 0);
    const healthMax = Number(this.system.health.effectiveMax ?? this.system.health.max ?? health);
    const healing = 1 + (treated ? 1 : 0) + (healerHands ? 1 : 0);
    const recovered = Math.max(0, Math.min(healing, healthMax - health));
    if (recovered) {
      updates["system.health.value"] = health + recovered;
      if (this.system.dying?.active) {
        updates["system.dying.active"] = false;
        updates["system.dying.difficulty"] = 0;
      }
      const reasons = ["1 por descansar", treated ? "+1 por el tratamiento" : "", healerHands ? "+1 por Manos sanadoras" : ""].filter(Boolean).join(", ");
      lines.push(`Recupera ${recovered} PV (${reasons}).`);
    } else lines.push("La vida ya estaba al máximo.");
    if (moduleActive("fantasy")) {
      updates["system.fantasy.mana.value"] = this.system.fantasy.manaMax ?? 0;
      updates["system.fantasy.incremental.difficulty"] = 2;
      updates["system.fantasy.incremental.reserveUsed"] = 0;
      lines.push("Maná y contador de Incremental restaurados.");
    }
    if (moduleActive("powers")) {
      updates["system.powers.energy.value"] = this.system.powers.energyMax ?? 20;
      lines.push("Energía restaurada.");
    }
    await this.update(updates);
    const daily = this.items.filter(item => Number(item.system.uses?.max) > 0 && ["day", "rest"].includes(item.system.uses.per));
    for (const item of daily) await item.update({ "system.uses.value": item.system.uses.max });
    if (daily.length) lines.push(`Usos diarios recuperados: ${daily.map(item => item.name).join(", ")}.`);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>${esc(this.name)} descansa</header><p>${lines.map(esc).join("<br>") || "Nada que recuperar."}</p></div>` });
  }

  async newScene() {
    const lines = [];
    const updates = {};
    if (moduleActive("cyber")) {
      updates["system.cyber.hackUses"] = 0;
      updates["system.cyber.neuralOverload"] = 0;
      lines.push("Usos de hacks y Sobrecarga neural reiniciados.");
      for (const implant of this.items.filter(item => item.type === "implant" && item.system.malfunction && item.system.installed !== false)) {
        const roll = await new Roll("1d4").evaluate();
        await implant.update({ "system.offline": roll.total === 1 });
        lines.push(`${implant.name} (averiado): 1d4 = ${roll.total}${roll.total === 1 ? " → no funciona en toda la escena" : " → funciona"}.`);
      }
    }
    const scene = this.items.filter(item => Number(item.system.uses?.max) > 0 && ["scene", "combat"].includes(item.system.uses.per));
    for (const item of scene) await item.update({ "system.uses.value": item.system.uses.max });
    if (scene.length) lines.push(`Usos por escena recuperados: ${scene.map(item => item.name).join(", ")}.`);
    if (this.type === "npc") updates["system.npcStats.villain.extraTurnUsed"] = false;
    await this.update(updates);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>Descanso pequeño: ${esc(this.name)}</header><p>${lines.map(esc).join("<br>") || "Sin cambios."}</p></div>` });
  }

  /* -------------------------------------------- */
  /*  Villains                                     */
  /* -------------------------------------------- */

  async spendVillain(kind) {
    const villain = this.system.npcStats.villain;
    const costs = { difficulty: 1, defense: 2, turn: 3, escape: 1 };
    const cost = costs[kind];
    const value = Number(villain.value || 0);
    if (kind === "escape" && value < 4) return ui.notifications.warn("Para un escape magistral hacen falta al menos 4 puntos de fuente de villano.");
    if (kind === "turn" && villain.extraTurnUsed) return ui.notifications.warn("El turno extra solo se puede usar una vez por combate.");
    if (value < cost) return ui.notifications.warn("No quedan suficientes puntos de fuente de villano.");
    const remaining = value - cost;
    const texts = {
      difficulty: "aumenta en 2 la dificultad de una de sus tiradas.",
      defense: "aumenta en 4 su dificultad para ser golpeado o su aguante ante este ataque.",
      turn: "juega otro turno.",
      escape: `intenta un escape magistral. El siguiente jugador debe superar dificultad ${remaining} para impedirlo.`
    };
    await this.update({ "system.npcStats.villain.value": remaining, ...(kind === "turn" ? { "system.npcStats.villain.extraTurnUsed": true } : {}) });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<div class="tdt-chat-card"><header>Fuente de villano</header><p>${esc(this.name)} gasta ${cost}: ${esc(texts[kind])}</p><p>Quedan ${remaining}.</p></div>` });
  }

  /* -------------------------------------------- */
  /*  Character creation check                     */
  /* -------------------------------------------- */

  async checkCreation() {
    const system = this.system;
    const advanced = rule("advancedCreation");
    const unlimited = advanced && advanced !== "normal";
    const issues = [];
    const info = [];
    const steps = die => Math.max(0, [4, 6, 8, 10, 12].indexOf(normalizeDie(die)));
    const attributeIncrements = Object.values(system.attributes).reduce((sum, attribute) => sum + steps(attribute.die), 0);
    info.push(`Incrementos de características: ${attributeIncrements} / 4.`);
    if (!unlimited && attributeIncrements !== 4) issues.push("Las características deben usar exactamente 4 incrementos.");
    if (!unlimited && Object.values(system.attributes).some(attribute => Number(attribute.die) > 8)) issues.push("Ninguna característica puede pasar de d8 al crear.");
    let skillPoints = 15 + modifierValue(this._tdtMods, "skillPoints");
    if (moduleActive("fantasy") && rule("races")) skillPoints -= 5;
    const skillIncrements = Object.entries(system.skills).reduce((sum, [, skill]) => sum + (normalizeDie(skill.die) ? steps(skill.die) + 1 : 0), 0);
    info.push(`Incrementos de habilidades: ${skillIncrements} / ${skillPoints}.`);
    if (!unlimited && skillIncrements !== skillPoints) issues.push(`Las habilidades deben usar exactamente ${skillPoints} incrementos.`);
    if (!unlimited && Object.values(system.skills).some(skill => Number(skill.die) > 8)) issues.push("Ninguna habilidad puede pasar de d8 al crear.");
    const defenseDice = Object.values(system.defenses).map(defense => Number(defense.die)).sort((a, b) => a - b).join("/");
    const validDefense = defenseDice === "6/6/6" || (rule("defenseSwap") && defenseDice === "4/6/8");
    info.push(`Dados defensivos: ${defenseDice}.`);
    if (!unlimited && !validDefense) issues.push(rule("defenseSwap") ? "Los dados defensivos deben ser d6/d6/d6 o d8/d6/d4." : "Los dados defensivos deben ser d6/d6/d6.");
    let xp = 20 + modifierValue(this._tdtMods, "xp");
    if (moduleActive("fantasy") && rule("races")) xp += 10;
    if (advanced === "expert") xp += 40;
    if (advanced === "elite") xp += 100;
    const featCost = this.items.filter(item => item.type === "feat").reduce((sum, item) => sum + Number(item.system.cost || 0), 0);
    info.push(`Experiencia inicial: ${xp}. Coste neto de dotes: ${featCost}.`);
    if (moduleActive("cyber")) {
      const stats = system.cyberStats;
      info.push(`CC ${stats.cc}, carga ${stats.load}, exceso ${stats.excess}.`);
      if (this.items.some(item => item.type === "implant" && item.system.supreme?.enabled)) issues.push("Los implantes supremos no se pueden escoger al crear el personaje.");
    }
    const content = `<div class="tdt-chat-card"><header>Comprobación de creación: ${esc(this.name)}</header>
      <ul>${info.map(line => `<li>${esc(line)}</li>`).join("")}</ul>
      ${issues.length ? `<p><strong>Revisar:</strong></p><ul>${issues.map(line => `<li>${esc(line)}</li>`).join("")}</ul>` : "<p><strong>Todo correcto.</strong></p>"}</div>`;
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content, whisper: [game.user.id] });
  }
}

/* -------------------------------------------- */
/*  Helpers                                      */
/* -------------------------------------------- */

function applyRuleToOptions(entry, options, check) {
  const value = Number(entry.value || 0);
  options.appliedRules.push(entry.label);
  switch (entry.type) {
    case "bonus": options.bonus += value; break;
    case "penalty": options.penalty += value; break;
    case "dieStep": {
      const both = check.linkedDice || entry.target === "both";
      const second = both || entry.target === "second" || (entry.target !== "first" && entry.scopes?.includes(check.secondaryScope));
      const first = both || !second;
      if (first) options.firstStep += value;
      if (second) options.secondStep += value;
      if (entry.floorOne && value < 0) {
        if (first) options.firstFloorOne = true;
        if (second) options.secondFloorOne = true;
      }
      break;
    }
    case "disadvantage":
      if (entry.target === "second") options.secondDisadvantage = true;
      else options.firstDisadvantage = true;
      break;
    case "advantage": options.secondAdvantage = true; break;
    case "noFumble": options.noFumble = true; break;
    case "worseDie": options.worseDie = value || 4; break;
    case "critical": options.criticalExtra = Number(options.criticalExtra || 0) + (value || 1); break;
    case "extraDie": options.extraDice.push(value || 4); break;
    case "difficulty": options.difficultyMod += value; break;
    case "flat": options.flat = Number(options.flat || 0) + value; break;
    case "damage": options.damageBonus += value; break;
    default: break;
  }
  if (entry.damage) options.damageBonus += Number(entry.damage);
  if (entry.noBonus) options.noBonus = true;
  if (entry.rerollOnes) options.rerollOnes = true;
  if (entry.rerollOnes && entry.consume !== "satr") options.followUpRerollOnes = true;
  if (entry.consume === "hackUse") options.consumed.push("hackUse");
  if (entry.consume === "satr") {
    options.consumeSatr = true;
    if (entry.type === "bonus") options.satrBonus = Number(options.satrBonus || 0) + value;
  }
  if (entry.consume === "evasionPenalty") options.consumeEvasionPenalty = true;
  if (entry.ignorePower) options.difficultyMod = Math.max(0, options.difficultyMod);
}

function stripOptions(options = {}) {
  const { preset, after, silent, extraRules, ...rest } = options;
  return rest;
}

export function currentTargets() {
  return [...(game.user.targets ?? [])].map(token => token.actor).filter(Boolean);
}

export function choiceDialog(title, prompt, choices) {
  return new Promise(resolve => {
    new Dialog({
      title,
      content: `<form><div class="form-group"><label>${esc(prompt)}</label><select name="choice">${choices.map(choice => `<option value="${esc(choice.id)}">${esc(choice.label)}</option>`).join("")}</select></div></form>`,
      buttons: {
        ok: { label: "Aceptar", callback: html => resolve(html[0].querySelector('[name="choice"]').value) },
        cancel: { label: "Cancelar", callback: () => resolve(null) }
      },
      default: "ok",
      close: () => resolve(null)
    }, { classes: ["tdt", "tdt-dialog"] }).render(true);
  });
}

export function numberDialog(title, prompt, initial = 0) {
  return new Promise(resolve => {
    new Dialog({
      title,
      content: `<form><div class="form-group"><label>${esc(prompt)}</label><input type="number" name="value" value="${Number(initial)}"></div></form>`,
      buttons: {
        ok: { label: "Aceptar", callback: html => resolve(Number(html[0].querySelector('[name="value"]').value)) },
        cancel: { label: "Cancelar", callback: () => resolve(null) }
      },
      default: "ok",
      close: () => resolve(null)
    }, { classes: ["tdt", "tdt-dialog"] }).render(true);
  });
}

export { itemNameSet, hasItemNamed, perfectSuccess };
