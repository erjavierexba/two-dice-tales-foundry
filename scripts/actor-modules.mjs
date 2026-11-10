import { TDT } from "./config.mjs";
import { DIE_SIZES, dieScore, normalizeDie, perfectSuccess, stepDie } from "./dice.mjs";
import { itemNameSet } from "./modifiers.mjs";
import { currencySettings, moduleActive, rule } from "./settings.mjs";
import { automaticDifficultyText, warnIfAllImmune, parseWeaponProperties, targetDefense, targetEndurance } from "./attack.mjs";
import { esc, payload, requestDamage } from "./chat.mjs";
import { TDTActor, choiceDialog, currentTargets, numberDialog } from "./actor.mjs";
import * as Fantasy from "./modules/fantasy.mjs";
import * as Mecha from "./modules/mecha.mjs";
import * as Zombie from "./modules/zombie.mjs";
import * as Cyber from "./modules/cyber.mjs";
import * as Vehicle from "./modules/vehicle.mjs";

const card = (title, body) => `<div class="tdt-chat-card"><header>${esc(title)}</header>${body}</div>`;
const say = (actor, title, body, extra = {}) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: card(title, body), ...extra });
const notesList = notes => (notes.filter(Boolean).length ? `<ul class="tdt-roll-notes">${notes.filter(Boolean).map(note => `<li>${esc(note)}</li>`).join("")}</ul>` : "");
const getItem = (actor, item) => (typeof item === "string" ? actor.items.get(item) : item);

function confirmDialog(title, text) {
  return Dialog.confirm({ title, content: `<p>${esc(text)}</p>`, options: { classes: ["tdt", "tdt-dialog"] } });
}

/** Lines against every target of an attack-like roll. */
function targetLines(actor, outcome, targets, { defenseKey = "evasion", damage = 0, endurance = target => targetEndurance(target), minimum = 0, afterEndurance = 0, options = { raw: true } } = {}) {
  const lines = [];
  for (const target of targets) {
    const defense = targetDefense(target, defenseKey);
    lines.push(actor._targetLine(target, { total: outcome.result.total, defense, damage, endurance: endurance(target), minimum, afterEndurance, defenseKey, options }));
  }
  return lines;
}

const methods = {
  /* -------------------------------------------- */
  /*  Vehicles                                     */
  /* -------------------------------------------- */

  /** Driving uses Destreza or Mente, chosen by the player (no question when both dice are equal). */
  async _drivingAttribute(options = {}) {
    if (options.attribute && this.system.attributes[options.attribute]) return options.attribute;
    const dexterity = this.system.attributes.dexterity;
    const mind = this.system.attributes.mind;
    if (Number(dexterity.value) === Number(mind.value)) return "dexterity";
    const order = Number(mind.value) > Number(dexterity.value) ? ["mind", "dexterity"] : ["dexterity", "mind"];
    return choiceDialog("Conducir", "¿Con qué característica conduces?", order.map(key => ({ id: key, label: `${this.system.attributes[key].label} (d${this.system.attributes[key].value})` })));
  },

  async driveVehicle(itemRef, options = {}) {
    const item = getItem(this, itemRef);
    if (!item || item.type !== "gear" || item.system.category !== "vehicle") return null;
    const vehicle = Vehicle.vehicleProfile(item);
    const feat = Vehicle.drivingFeat(this, vehicle.category);
    if (!feat.trained && vehicle.autopilot && !options.preset) {
      return say(this, `Piloto automático: ${item.name}`, `<p>El vehículo realiza la maniobra con un valor fijo de <strong>${vehicle.autopilot}</strong>.</p>`);
    }
    if (!feat.trained) return ui.notifications.warn(`Necesitas la dote Conducir (${vehicle.category}) para manejar ${item.name}.`);
    const attributeKey = await this._drivingAttribute(options);
    if (!attributeKey) return null;
    const attribute = this.system.attributes[attributeKey];
    const extraRules = [];
    if (vehicle.modifier > 0) extraRules.push({ type: "bonus", value: vehicle.modifier, label: item.name });
    if (vehicle.modifier < 0) extraRules.push({ type: "penalty", value: -vehicle.modifier, label: item.name });
    if (feat.kansei) extraRules.push({ type: "bonus", value: 1, label: "Kansei Dorifto" });
    return this.rollCheck({
      kind: "vehicle",
      label: `Conducir: ${item.name}`,
      subtitle: `${vehicle.category} · ${vehicle.passengers} pasajeros · PV ${vehicle.health.value}/${vehicle.health.max} · Aguante ${vehicle.endurance}`,
      scopes: ["vehicle", "driving", attributeKey],
      primaryScope: attributeKey,
      secondaryScope: "driving",
      first: { label: attribute.label, faces: attribute.value },
      second: { label: feat.kansei ? "Kansei Dorifto" : "Conducir", faces: feat.kansei ? 8 : 4 },
      difficulty: options.difficulty ?? 0,
      extraRules,
      reroll: { method: "driveVehicle", args: [item.id, { attribute: attributeKey }] }
    }, options.preset);
  },

  async ramVehicle(itemRef, options = {}) {
    const item = getItem(this, itemRef);
    if (!item || item.type !== "gear" || item.system.category !== "vehicle") return null;
    const vehicle = Vehicle.vehicleProfile(item);
    const feat = Vehicle.drivingFeat(this, vehicle.category);
    if (!feat.trained) return ui.notifications.warn(`Necesitas la dote Conducir (${vehicle.category}) para embestir con ${item.name}.`);
    const targets = currentTargets();
    if (!targets.length) return ui.notifications.warn("Marca un objetivo antes de embestir.");
    const defenseKey = "evasion";
    if (!options.preset && warnIfAllImmune(targets, defenseKey)) return null;
    const single = targets.length === 1 ? targetDefense(targets[0], defenseKey) : null;
    const attributeKey = await this._drivingAttribute(options);
    if (!attributeKey) return null;
    const attribute = this.system.attributes[attributeKey];
    const extraRules = [];
    if (vehicle.modifier > 0) extraRules.push({ type: "bonus", value: vehicle.modifier, label: item.name });
    if (vehicle.modifier < 0) extraRules.push({ type: "penalty", value: -vehicle.modifier, label: item.name });
    if (feat.kansei) extraRules.push({ type: "bonus", value: 1, label: "Kansei Dorifto" });
    return this.rollCheck({
      kind: "vehicleAttack",
      label: `Embestida: ${item.name}`,
      subtitle: `Daño ${vehicle.crashDamage} · objetivo ${targets.map(target => target.name).join(", ")}`,
      scopes: ["vehicle", "driving", "attack", "melee-attack", attributeKey],
      primaryScope: attributeKey,
      secondaryScope: "driving",
      first: { label: attribute.label, faces: attribute.value },
      second: { label: feat.kansei ? "Kansei Dorifto" : "Conducir", faces: feat.kansei ? 8 : 4 },
      difficulty: single ?? 0,
      automaticDifficulty: automaticDifficultyText(targets, defenseKey),
      extraRules,
      reroll: { method: "ramVehicle", args: [item.id, { attribute: attributeKey }] },
      after: outcome => ({ html: `<div class="tdt-roll-weapon"><strong>Daño:</strong> ${vehicle.crashDamage} · Embestida</div>${targetLines(this, outcome, targets, { defenseKey, damage: vehicle.crashDamage }).map(line => line.html).join("")}` })
    }, options.preset);
  },

  async damageVehicle(itemRef) {
    const item = getItem(this, itemRef);
    if (!item || item.type !== "gear" || item.system.category !== "vehicle") return null;
    const vehicle = Vehicle.vehicleProfile(item);
    if (!vehicle.health.max) return ui.notifications.warn(`${item.name} no tiene puntos de vida configurados.`);
    const incoming = await numberDialog(`Daño a ${item.name}`, `Daño recibido antes de aplicar Aguante ${vehicle.endurance}`, 0);
    if (incoming === null) return null;
    const damage = Math.max(0, Number(incoming) - vehicle.endurance);
    const value = Math.max(0, vehicle.health.value - damage);
    await item.update({
      "system.vehicle.health.max": vehicle.health.max,
      "system.vehicle.health.value": value
    });
    return say(this, `Daño de vehículo: ${item.name}`, `<p>Recibe <strong>${damage} PV</strong> tras Aguante ${vehicle.endurance}. Integridad: <strong>${value}/${vehicle.health.max}</strong>.</p>`);
  },

  /* -------------------------------------------- */
  /*  Fantasy: simple magic                        */
  /* -------------------------------------------- */

  async castSimpleSpell(featRef, options = {}) {
    const feat = getItem(this, featRef);
    if (!feat) return null;
    const fantasy = this.system.fantasy;
    const attributeKey = fantasy.magicAttribute || "mind";
    const skillKey = fantasy.magicSkill || "arcana";
    const attribute = this.system.attributes[attributeKey];
    const skill = this.system.skills[skillKey];
    const names = itemNameSet(this, "feat");
    const isProjectile = /proyectil m[aá]gico/i.test(feat.name);
    const canFlow = isProjectile && names.has("flujo mágico");
    const canRange = isProjectile && names.has("aumento de alcance");
    const baseIncrement = Number(feat.system.incremental || 0);
    let difficulty = baseIncrement ? Number(fantasy.incremental.difficulty || 2) : 0;
    const noFocus = !fantasy.hasFocus && !Fantasy.hasInnerMagic(this);
    if (noFocus) difficulty = Math.max(difficulty, 10);
    const attack = feat.system.attack ?? {};
    const targets = attack.enabled ? currentTargets() : [];
    const defenseKey = attack.defense || "evasion";
    if (!options.preset && warnIfAllImmune(targets, defenseKey)) return null;
    const extraFields = [
      canFlow ? `<div class="form-group"><label>Flujo mágico (Daño +2, Incremental +1)</label><input type="checkbox" name="flow"></div>` : "",
      canRange ? `<div class="form-group"><label>Aumento de alcance (siguiente distancia, Incremental +1)</label><input type="checkbox" name="range"></div>` : "",
      noFocus ? `<p class="hint">Sin objeto canalizador: la dificultad es 10.</p>` : "",
      baseIncrement ? `<p class="hint">Incremental ${baseIncrement}. Reserva gratuita: ${Math.max(0, (fantasy.reserveMax ?? 0) - Number(fantasy.incremental.reserveUsed || 0))}.</p>` : "",
      targets.length ? `<p class="hint">Objetivos: ${targets.map(target => esc(target.name)).join(", ")}.</p>` : ""
    ].join("");
    return this.rollCheck({
      kind: "spell",
      label: `Magia: ${feat.name}`,
      subtitle: feat.system.tags?.length ? feat.system.tags.join(", ") : "",
      scopes: ["magic", skillKey, attributeKey, ...(attack.enabled ? ["attack", "ranged-attack"] : [])],
      primaryScope: attributeKey,
      secondaryScope: skillKey,
      first: { label: attribute.label, faces: attribute.value },
      second: { label: skill.label, faces: skill.value },
      difficulty,
      extraFields,
      readExtra: (form, data) => ({ flow: Boolean(data.get("flow")), range: Boolean(data.get("range")) }),
      reroll: { method: "castSimpleSpell", args: [feat.id, {}] },
      after: async outcome => {
        const { result } = outcome;
        const extra = outcome.options.extra ?? {};
        const notes = [];
        const increment = Fantasy.simpleSpellIncrement(this, feat, { boostedDamage: extra.flow, boostedRange: extra.range });
        const succeeded = difficulty ? result.success : !result.isFumble;
        if (!options.preset && succeeded && increment) {
          const next = Fantasy.applyIncremental(fantasy.incremental, increment, fantasy.reserveMax ?? 0);
          await this.update({ "system.fantasy.incremental.difficulty": next.difficulty, "system.fantasy.incremental.reserveUsed": next.reserveUsed });
          notes.push(`Incremental ${increment}: la próxima dificultad es ${next.difficulty}.`);
        }
        if (!options.preset && Number(feat.system.sacrifice || 0)) {
          await this.applyDamage(Number(feat.system.sacrifice), { raw: true });
          notes.push(`Sacrificio ${feat.system.sacrifice}: pierdes ${feat.system.sacrifice} PV.`);
        }
        if (perfectSuccess(result)) notes.push(`Superado perfecto${names.has("elementalista") && isProjectile ? ": aplica el efecto de Elementalista de tu elemento" : ""}.`);
        if (/restauradora/i.test(feat.name) && (result.isFumble || (difficulty && result.total < difficulty - 4))) notes.push("Fallo por más de 4 o pifia: en lugar de curar, inflige 1 punto de daño ignorando el aguante.");
        let lines = [];
        if (attack.enabled && succeeded) {
          const damage = Number(attack.damage || 0) + (extra.flow ? 2 : 0);
          lines = targetLines(this, outcome, targets, { defenseKey, damage });
          notes.unshift(`Daño ${damage}${attack.area ? " en área" : ""}.`);
        } else if (attack.enabled) notes.unshift("El hechizo no llega a lanzarse.");
        return { html: `${lines.map(line => line.html).join("")}${notesList(notes)}<div class="tdt-item-message">${esc(feat.system.description)}</div>` };
      }
    }, options.preset);
  },

  /* -------------------------------------------- */
  /*  Fantasy: magic circles                       */
  /* -------------------------------------------- */

  async castCircle(spellRef, options = {}) {
    const spell = getItem(this, spellRef);
    if (!spell) return null;
    const fantasy = this.system.fantasy;
    const parts = Fantasy.knownCircleParts(this);
    const hasFocus = fantasy.hasFocus || Fantasy.hasInnerMagic(this);
    const cost = Fantasy.circleCost(spell.system, { feats: parts.feats, hasFocus });
    const mana = Number(fantasy.mana.value || 0);
    if (mana < cost.mana && !options.preset) {
      ui.notifications.warn(`${spell.name} cuesta ${cost.mana} de maná y solo tienes ${mana}.`);
      return null;
    }
    const unknown = [
      ...(spell.system.marks ?? []).filter(mark => mark.root && !parts.roots.has(mark.root)).map(mark => TDT.circleRoots[mark.root]?.label),
      ...[...new Set([...(spell.system.marks ?? []).flatMap(mark => mark.modifiers ?? []), ...(spell.system.shared ?? []).map(entry => entry.modifier)])].filter(key => key && !parts.modifiers.has(key)).map(key => TDT.circleModifiers[key]?.label)
    ].filter(Boolean);
    const attributeKey = fantasy.magicAttribute || "mind";
    const skillKey = fantasy.magicSkill || "arcana";
    const attribute = this.system.attributes[attributeKey];
    const skill = this.system.skills[skillKey];
    const targets = spell.system.attack?.enabled ? currentTargets() : [];
    const defenseKey = spell.system.attack?.defense || "evasion";
    if (!options.preset && warnIfAllImmune(targets, defenseKey)) return null;
    return this.rollCheck({
      kind: "circle",
      label: `Círculo: ${spell.name}`,
      subtitle: `Inscripción ${cost.inscription} · Dificultad ${cost.difficulty} · Maná ${cost.mana}${unknown.length ? ` · No conoces: ${unknown.join(", ")}` : ""}`,
      scopes: ["magic", "circle", skillKey, attributeKey, ...(spell.system.attack?.enabled ? ["attack"] : [])],
      primaryScope: attributeKey,
      secondaryScope: skillKey,
      first: { label: attribute.label, faces: attribute.value },
      second: { label: skill.label, faces: skill.value },
      difficulty: cost.difficulty,
      extraFields: targets.length ? `<p class="hint">Objetivos: ${targets.map(target => esc(target.name)).join(", ")}. La misma tirada debe superar la formulación y la defensa.</p>` : "",
      reroll: { method: "castCircle", args: [spell.id, {}] },
      after: async outcome => {
        const { result } = outcome;
        let spent = options.preset ? 0 : cost.mana;
        if (!options.preset && !result.isFumble && !result.success) spent = Math.ceil(cost.mana / 2);
        if (!options.preset) await this.update({ "system.fantasy.mana.value": Math.max(0, Number(this.system.fantasy.mana.value || 0) - spent) });
        const notes = [Fantasy.circleResultText(result), options.preset ? "Repetición: no vuelve a gastar maná." : `Maná gastado: ${spent}.`];
        let lines = [];
        if (spell.system.attack?.enabled && result.success) {
          const damage = cost.damage + (perfectSuccess(result) ? 1 : 0);
          lines = targetLines(this, outcome, targets, { defenseKey, damage });
          notes.unshift(`Daño ${damage}${perfectSuccess(result) ? " (incluye +1 de superado perfecto)" : ""}.`);
        }
        return { html: `${lines.map(line => line.html).join("")}${notesList(notes)}${spell.system.description ? `<div class="tdt-item-message">${esc(spell.system.description)}</div>` : ""}` };
      }
    }, options.preset);
  },

  /* -------------------------------------------- */
  /*  Superpowers                                  */
  /* -------------------------------------------- */

  async usePower(powerRef, options = {}) {
    const power = getItem(this, powerRef);
    if (!power) return null;
    const system = power.system;
    if (system.permanent) return say(this, power.name, `<p>Poder permanente: ya está aplicado a la ficha.</p><div class="tdt-item-message">${esc(system.description)}</div>`);
    let overload = 0;
    let variable = 0;
    if (!options.preset && (Number(system.overload) || system.variableCost)) {
      const form = await new Promise(resolve => {
        new Dialog({
          title: power.name,
          content: `<form>${system.variableCost ? `<div class="form-group"><label>Energía a gastar</label><input type="number" name="variable" min="0" value="1"></div>` : ""}
            ${Number(system.overload) ? `<div class="form-group"><label>Sobrecarga (0 a ${system.overload})</label><input type="number" name="overload" min="0" max="${system.overload}" value="0"><p class="hint">Cada punto cuesta 1 de energía más. En ataques suma Daño; en controles reduce la dificultad.</p></div>` : ""}</form>`,
          buttons: {
            ok: { label: "Usar", callback: html => resolve({ overload: Number(html[0].querySelector('[name="overload"]')?.value || 0), variable: Number(html[0].querySelector('[name="variable"]')?.value || 0) }) },
            cancel: { label: "Cancelar", callback: () => resolve(null) }
          },
          default: "ok",
          close: () => resolve(null)
        }, { classes: ["tdt", "tdt-dialog"] }).render(true);
      });
      if (!form) return null;
      overload = Math.max(0, Math.min(Number(system.overload), form.overload));
      variable = Math.max(0, form.variable);
    }
    const cost = Number(system.energyCost || 0) + variable + overload;
    const energy = Number(this.system.powers.energy.value || 0);
    if (system.cursed && energy < cost) return ui.notifications.warn(`${power.name} es Maldito: necesitas ${cost} de energía.`);
    const energyPaid = Math.min(energy, cost);
    const healthPaid = system.cursed ? cost : cost - energyPaid;
    // The cost is paid once the power is actually used, so cancelling the attack roll keeps the energy.
    const payCost = async () => {
      if (options.preset) return;
      await this.update({ "system.powers.energy.value": Math.max(0, Number(this.system.powers.energy.value || 0) - energyPaid) });
      if (healthPaid > 0) await this.applyDamage(healthPaid, { raw: true });
      if (system.toggle) await power.update({ "system.active": true });
    };
    const notes = [options.preset ? "Repetición: no vuelve a pagar el coste." : `Coste: ${energyPaid} de energía${healthPaid ? ` y ${healthPaid} PV` : ""}.`];
    if (overload) notes.push(`Sobrecarga ${overload}: ${system.attack?.enabled && system.attack.overloadDamage ? `Daño +${overload}` : `reduce la dificultad en ${overload}`}.`);
    if (!system.attack?.enabled) await payCost();
    if (!system.attack?.enabled) return say(this, power.name, `${notesList(notes)}<div class="tdt-item-message">${esc(system.description)}</div>`);
    const skill = this.system.skills.superpower;
    const attributeKey = skill.attribute || "social";
    const attribute = this.system.attributes[attributeKey];
    const targets = currentTargets();
    const defenseKey = system.attack.defense || "evasion";
    if (!options.preset && warnIfAllImmune(targets, defenseKey)) return null;
    const damage = Number(system.attack.damage || 0) + (system.attack.overloadDamage ? overload : 0);
    return this.rollCheck({
      kind: "power",
      label: `Poder: ${power.name}`,
      scopes: ["superpower", attributeKey, "power", "attack"],
      primaryScope: attributeKey,
      secondaryScope: "superpower",
      first: { label: attribute.label, faces: attribute.value },
      second: { label: skill.label, faces: skill.value },
      difficulty: targets.length === 1 ? targetDefense(targets[0], defenseKey) ?? 0 : 0,
      automaticDifficulty: automaticDifficultyText(targets, defenseKey),
      reroll: { method: "usePower", args: [power.id, {}] },
      after: async outcome => {
        await payCost();
        const lines = targetLines(this, outcome, targets, { defenseKey, damage });
        return { html: `<div class="tdt-roll-weapon"><strong>Daño:</strong> ${damage}</div>${lines.map(line => line.html).join("")}${notesList(notes)}` };
      }
    }, options.preset);
  },

  /* -------------------------------------------- */
  /*  Zombies                                      */
  /* -------------------------------------------- */

  async zombieBite(source = "bite") {
    const difficulty = Zombie.biteDifficulty(this.tdtFlags, source);
    const result = await this.rollDefense("fortitude", { label: source === "acid" ? "Ácido de zombi escupidor" : "Mordisco zombi", difficulty });
    if (!result) return;
    const current = Number(this.system.zombie.zombification || 0);
    if (result.success) return say(this, "Zombificación", `<p>${esc(this.name)} resiste la infección.</p>`);
    let next = current ? current + 1 : this.tdtFlags.has("antibodiesZ") ? 2 : 1;
    next = Math.min(5, next);
    await this.update({ "system.zombie.zombification": next });
    return say(this, "Zombificación", `<p>${esc(this.name)} pasa a <strong>zombificación ${next}</strong>. ${esc(TDT.zombification[next])}</p>${current === 0 ? "<p>Ya no puede curarse jamás.</p>" : ""}`);
  },

  async takeZombieMedicine(kind) {
    if (kind === "zombix") {
      await this.update({ "system.zombie.zombixToday": true });
      return say(this, "Zombix", "<p>La zombificación se pausa un día: hoy no hay tirada.</p>");
    }
    const current = Number(this.system.zombie.zombification || 0);
    if (!current) return ui.notifications.info(`${this.name} no está zombificado: no necesita Antizombix.`);
    const next = current ? Math.max(1, current - 1) : 0;
    await this.update({ "system.zombie.zombification": next });
    return say(this, "Antizombix", `<p>La zombificación baja a ${next} (mínimo 1).</p>`);
  },

  async endOfDay() {
    const zombie = this.system.zombie;
    const need = Number(zombie.foodNeed || 0);
    const requested = await numberDialog("Fin del día", `Víveres que come hoy (necesita ${need}, tiene ${zombie.food})`, Math.min(need, Number(zombie.food || 0)));
    if (requested === null) return;
    const eaten = Math.max(0, Math.min(Number(requested) || 0, Number(zombie.food || 0)));
    const lines = [];
    const updates = { "system.zombie.food": Math.max(0, Number(zombie.food || 0) - eaten) };
    let hunger = Number(zombie.hunger || 0);
    if (eaten >= need) {
      hunger = Zombie.hungerRecovery(hunger, need, eaten);
      updates["system.zombie.daysWithoutFood"] = 0;
      lines.push(`Come lo necesario. Hambruna: ${hunger}.`);
    } else {
      // The rule counts days eating nothing, not every day eating too little.
      const days = eaten > 0 ? Math.max(1, Number(zombie.daysWithoutFood || 0)) : Number(zombie.daysWithoutFood || 0) + 1;
      let difficulty = Zombie.hungerDifficulty(need, eaten, days);
      if (this.tdtFlags.has("hungerResistant")) difficulty = Math.max(0, difficulty - 2);
      updates["system.zombie.daysWithoutFood"] = days;
      updates["system.zombie.lastHungerDifficulty"] = difficulty;
      const result = await this.rollDefense("fortitude", { label: "Hambruna", difficulty });
      if (result && !result.success) hunger = Math.min(5, hunger + 1);
      lines.push(`No come suficiente (${eaten}/${need}). Fortaleza contra ${difficulty}: ${result?.success ? "la hambruna no avanza" : `hambruna ${hunger}`}.`);
    }
    updates["system.zombie.hunger"] = hunger;
    updates["system.zombie.searchUsedToday"] = false;
    if (hunger) lines.push(`Hambruna ${hunger}: ${TDT.hunger[hunger]}`);
    const z = Number(zombie.zombification || 0);
    if (z >= 1) {
      if (zombie.zombixToday) {
        lines.push("Zombix: hoy no se tira por la zombificación.");
        updates["system.zombie.zombixToday"] = false;
      } else {
        const difficulty = 10 + 2 * Number(zombie.zombificationChecks || 0);
        const result = await this.rollDefense("fortitude", { label: "Avance de la zombificación", difficulty });
        if (result?.success) {
          updates["system.zombie.zombificationChecks"] = Number(zombie.zombificationChecks || 0) + 1;
          lines.push(`Resiste la zombificación (dificultad ${difficulty}); mañana será ${difficulty + 2}.`);
        } else if (result) {
          const next = Math.min(5, z + 1);
          updates["system.zombie.zombification"] = next;
          lines.push(`La zombificación avanza a ${next}: ${TDT.zombification[next]}`);
        }
      }
    }
    await this.update(updates);
    return say(this, "Fin del día", `<p>${lines.map(esc).join("<br>")}</p>`);
  },

  async searchSupplies() {
    const pack = game.packs.get("tdt.zombie-tables");
    const index = await pack?.getIndex();
    const entry = index?.find(table => /recompensas/i.test(table.name));
    if (!entry) return ui.notifications.warn("No se encuentra la tabla de recompensas zombi.");
    const table = await pack.getDocument(entry._id);
    const seasoned = this.tdtFlags.has("seasonedSearcher") && !this.system.zombie.searchUsedToday;
    const draws = seasoned ? 2 : 1;
    for (let i = 0; i < draws; i++) await table.draw({ rollMode: game.settings.get("core", "rollMode") });
    if (seasoned) {
      await this.update({ "system.zombie.searchUsedToday": true });
      say(this, "Buscador avezado", "<p>Tira dos veces y elige uno de los resultados. El beneficio queda gastado hasta el siguiente día.</p>");
    }
  },

  /* -------------------------------------------- */
  /*  Crafting, repairing and dismantling          */
  /* -------------------------------------------- */

  async craft() {
    const zombie = moduleActive("zombie");
    const cyber = moduleActive("cyber");
    if (!zombie && !cyber) return ui.notifications.warn("La construcción con materiales es del módulo de zombis o del cyberpunk.");
    const useCyber = cyber && (!zombie || (await choiceDialog("Construcción", "¿Qué sistema de materiales usas?", [{ id: "cyber", label: "Cyberpunk (armas, genéricos, construcción)" }, { id: "zombie", label: "Zombis (materiales)" }])) === "cyber");
    const recipes = useCyber ? TDT.cyberRecipes : TDT.zombieRecipes;
    const weapons = this.items.filter(item => item.type === "weapon");
    const content = `<form>
      <div class="form-group"><label>Acción</label><select name="mode"><option value="craft">Fabricar o construir</option><option value="repair">Reparar arma (sube un estado)</option>${useCyber ? `<option value="dismantle">Desguazar</option><option value="armor">Reparar armadura (1 material de construcción por punto)</option>` : ""}</select></div>
      <div class="form-group"><label>Receta</label><select name="recipe">${recipes.map(recipe => `<option value="${recipe.key}">${esc(recipe.label)}${useCyber ? ` (${recipe.weapons}/${recipe.generic}/${recipe.construction} · ${recipe.difficulty})` : ` (${recipe.materials})`}</option>`).join("")}</select></div>
      <div class="form-group"><label>Arma (reparar)</label><select name="weapon"><option value="">—</option>${weapons.map(item => `<option value="${item.id}">${esc(item.name)} (${TDT.weaponConditions[item.system.condition || "normal"]})</option>`).join("")}</select></div>
      ${useCyber ? `<div class="form-group"><label>Armadura (reparar)</label><select name="armor"><option value="">—</option>${this.items.filter(item => item.type === "armor").map(item => `<option value="${item.id}">${esc(item.name)} (−${item.system.damage || 0})</option>`).join("")}</select></div>` : `<div class="form-group"><label>Dificultad (DJ)</label><input type="number" name="difficulty" value="6"></div>`}
      <div class="form-group"><label>Característica</label><select name="attribute"><option value="mind">Mente</option><option value="dexterity">Destreza</option><option value="power">Potencia</option></select></div>
      <div class="form-group"><label>Tengo las herramientas adecuadas</label><input type="checkbox" name="tools" checked></div>
    </form>`;
    const form = await new Promise(resolve => {
      new Dialog({
        title: "Construir, reparar o desguazar",
        content,
        buttons: {
          ok: { label: "Continuar", callback: html => resolve(Object.fromEntries(new FormData(html[0].querySelector("form")))) },
          cancel: { label: "Cancelar", callback: () => resolve(null) }
        },
        default: "ok",
        close: () => resolve(null)
      }, { classes: ["tdt", "tdt-dialog"] }).render(true);
    });
    if (!form) return;
    const recipe = recipes.find(entry => entry.key === form.recipe);
    const flags = this.tdtFlags;
    const weapon = form.weapon ? this.items.get(form.weapon) : null;
    if (form.mode === "repair" && !weapon) return ui.notifications.warn("Elige el arma que quieres reparar.");
    if (form.mode === "repair" && weapon.system.condition === "pristine") return ui.notifications.info(`${weapon.name} ya está impoluta.`);

    if (useCyber) {
      const stock = this.system.cyber.materials;
      if (form.mode === "dismantle") {
        const ratio = flags.has("scrapper") ? 1 : 0.8;
        const gained = { weapons: Math.floor(recipe.weapons * ratio), generic: Math.floor(recipe.generic * ratio), construction: Math.floor(recipe.construction * ratio) };
        await this.update({ "system.cyber.materials.weapons": stock.weapons + gained.weapons, "system.cyber.materials.generic": stock.generic + gained.generic, "system.cyber.materials.construction": stock.construction + gained.construction });
        return say(this, `Desguace: ${recipe.label}`, `<p>Recuperas ${gained.weapons} de armas, ${gained.generic} genéricos y ${gained.construction} de construcción${ratio === 1 ? " (Chatarrero)" : ""}.</p>`);
      }
      if (form.mode === "armor") {
        const armor = form.armor ? this.items.get(form.armor) : null;
        if (!armor || !Number(armor.system.damage)) return ui.notifications.warn("Elige una armadura dañada.");
        const points = Math.min(Number(armor.system.damage), stock.construction);
        if (!points) return ui.notifications.warn("No tienes materiales de construcción.");
        await this.update({ "system.cyber.materials.construction": stock.construction - points });
        await armor.update({ "system.damage": Number(armor.system.damage) - points });
        return say(this, `Reparación: ${armor.name}`, `<p>Recupera ${points} de aguante por ${points} materiales de construcción.</p>`);
      }
      const factor = form.mode === "repair" ? 0.5 : 1;
      const cost = {
        weapons: form.mode === "repair" ? Math.ceil(recipe.weapons * factor) : recipe.weapons,
        generic: form.mode === "repair" ? Math.ceil(recipe.generic * factor) : recipe.generic,
        construction: form.mode === "repair" ? Math.ceil(recipe.construction * factor) : recipe.construction
      };
      if (cost.weapons > stock.weapons || cost.generic > stock.generic || cost.construction > stock.construction) {
        return ui.notifications.warn(`Faltan materiales: necesitas ${cost.weapons}/${cost.generic}/${cost.construction} (armas/genéricos/construcción).`);
      }
      const skill = recipe.tier ? "cybernetics" : "crafting";
      const skillKey = form.mode === "repair" || !recipe.tier ? "crafting" : skill;
      const result = await this.rollSkill(skillKey, {
        attribute: form.attribute,
        label: `${form.mode === "repair" ? "Reparar" : "Fabricar"}: ${weapon?.name ?? recipe.label}`,
        difficulty: recipe.difficulty,
        scopes: ["craft"],
        extraRules: form.tools ? [] : [{ type: "penalty", value: 2, label: "Sin herramientas" }]
      });
      if (!result) return;
      let lost = cost;
      if (!result.success) {
        lost = result.isFumble ? cost : { weapons: Math.floor(cost.weapons / 2), generic: Math.floor(cost.generic / 2), construction: Math.floor(cost.construction / 2) };
      }
      await this.update({ "system.cyber.materials.weapons": stock.weapons - lost.weapons, "system.cyber.materials.generic": stock.generic - lost.generic, "system.cyber.materials.construction": stock.construction - lost.construction });
      if (result.success && weapon && form.mode === "repair") await this._raiseWeaponCondition(weapon);
      return say(this, "Construcción", `<p>${result.success ? "Terminado." : result.isFumble ? "Pifia: pierdes todos los materiales (el DJ puede añadir consecuencias)." : "Fallo: pierdes la mitad de los materiales."} Gastado: ${lost.weapons}/${lost.generic}/${lost.construction}.</p>`);
    }

    const materials = Number(this.system.zombie.materials || 0);
    let needed = recipe.materials;
    if (flags.has("materialSaver")) needed -= Number(this.system.skills.crafting.value) >= 8 ? 2 : 1;
    needed = Math.max(1, needed);
    if (needed > materials) return ui.notifications.warn(`Necesitas ${needed} materiales y tienes ${materials}.`);
    let difficulty = Number(form.difficulty || 6);
    if (recipe.ammo && flags.has("bulletRecycler")) difficulty -= 2;
    if (recipe.repair && flags.has("weaponSaver")) difficulty -= 1;
    const extraRules = form.tools ? [] : [{ type: "penalty", value: 2, label: "Sin herramientas" }];
    if (recipe.defensive && flags.has("antiZombieBuilder")) extraRules.push({ type: "bonus", value: 2, label: "Constructor antizombies" });
    const result = await this.rollSkill("crafting", { attribute: form.attribute, label: weapon ? `Reparar: ${weapon.name}` : recipe.label, difficulty: Math.max(0, difficulty), scopes: ["craft"], extraRules });
    if (!result) return;
    const lost = result.success ? needed : Math.floor(needed / 2);
    await this.update({ "system.zombie.materials": materials - lost });
    if (result.success && weapon && (form.mode === "repair" || recipe.repair)) await this._raiseWeaponCondition(weapon);
    return say(this, "Construcción", `<p>${result.success ? "Terminado" : "Fallo: se desperdicia la mitad de los materiales"}. Materiales gastados: ${lost}.${result.isFumble ? " Pifia: el DJ puede añadir consecuencias (ruido, daño, atraer enemigos…)." : ""}</p>`);
  },

  async _raiseWeaponCondition(weapon) {
    const order = TDT.weaponConditionOrder;
    const current = weapon.system.condition || "normal";
    const next = order[Math.min(order.length - 1, order.indexOf(current) + 1)];
    await weapon.update({ "system.condition": next });
  },

  /* -------------------------------------------- */
  /*  Cyberpunk                                    */
  /* -------------------------------------------- */

  async rollExcess() {
    const excess = Number(this.system.cyberStats?.excess || 0);
    const difficulty = 4 + excess;
    let outcomeText = null;
    await this.rollDefense("will", {
      label: "Exceso de carga",
      difficulty,
      scopes: ["excess"],
      after: outcome => {
        const outcomeData = Cyber.excessOutcome(outcome.result, excess);
        outcomeText = outcomeData;
        return { html: `<div class="tdt-excess ${outcomeData.key}">${esc(outcomeData.text)}</div>` };
      }
    });
    return outcomeText;
  },

  async castHack(hackRef, options = {}) {
    const hack = getItem(this, hackRef);
    if (!hack) return null;
    const stats = this.system.cyberStats ?? {};
    const system = hack.system;
    const flags = this.tdtFlags;
    if (flags.has("animal")) return ui.notifications.warn("Un Animal no tiene VirtualSelf: no puede llevar AVS.");
    if (!options.preset) {
      if (!stats.slots) return ui.notifications.warn("Necesitas un AVS o un terminal externo equipado para hackear.");
      if (!system.loaded) return ui.notifications.warn(`${hack.name} no está cargado en ninguna ranura.`);
      if (stats.usesLeft <= 0) return ui.notifications.warn("Ya has lanzado todos los hacks de esta escena.");
      if (!Cyber.hackRequirementMet(this, hack)) return ui.notifications.warn(`${hack.name} requiere Hacking d${system.requirement}.`);
      if (system.wired && !stats.wiredCapable && !flags.has("hackerHands")) return ui.notifications.warn(`${hack.name} solo se lanza por cable y no tienes conexión cableada.`);
      const overloadLimit = flags.has("overclocking") ? 2 : 1;
      if (system.neuralOverload && Number(this.system.cyber.neuralOverload || 0) >= overloadLimit) return ui.notifications.warn("Tu chip está sobrecargado: no puedes lanzar otro hack con Sobrecarga neural hasta la siguiente escena.");
    }
    // The use is spent once the hack is actually launched, so cancelling the roll dialog keeps it.
    const spendUse = async () => {
      if (options.preset) return;
      await this.update({
        "system.cyber.hackUses": Number(this.system.cyber.hackUses || 0) + 1,
        "system.cyber.neuralOverload": Number(this.system.cyber.neuralOverload || 0) + (system.neuralOverload ? 1 : 0)
      });
    };
    const defense = system.defense || "evasion";
    if (defense === "none") await spendUse();
    if (defense === "none") return say(this, `Hack: ${hack.name}`, `<p>No hace falta tirar.</p><div class="tdt-item-message">${esc(system.description)}</div>`);
    const targets = currentTargets();
    if (!options.preset && warnIfAllImmune(targets, defense)) return null;
    const extraRules = [];
    if (stats.hackPenalty) extraRules.push({ type: "penalty", value: stats.hackPenalty, label: "Terminal externo" });
    if (stats.wiredCapable) extraRules.push({ type: "difficulty", value: 2, label: "Conexión por cable", optional: !system.wired });
    if (flags.has("hackerHands")) extraRules.push({ type: "bonus", value: 2, label: "Manos de hacker (tocando al objetivo; cuenta como cable)", optional: true });
    const skill = this.system.skills.hacking;
    const attribute = this.system.attributes.mind;
    const single = targets.length === 1 ? targetDefense(targets[0], defense) : null;
    return this.rollCheck({
      kind: "hack",
      label: `Hack: ${hack.name}`,
      subtitle: `Defensa: ${TDT.hackDefenses[defense]}${system.properties ? ` · ${system.properties}` : ""}`,
      scopes: ["hacking", "mind", "hack", ...(system.damage ? ["attack"] : [])],
      primaryScope: "mind",
      secondaryScope: "hacking",
      first: { label: attribute.label, faces: attribute.value },
      second: { label: skill.label, faces: skill.value },
      difficulty: single ?? 0,
      automaticDifficulty: automaticDifficultyText(targets, defense),
      extraRules,
      extraFields: targets.length ? `<p class="hint">Objetivos: ${targets.map(target => esc(target.name)).join(", ")}.</p>` : "",
      reroll: { method: "castHack", args: [hack.id, {}] },
      after: async outcome => {
        await spendUse();
        const { result } = outcome;
        const notes = [];
        const lines = [];
        for (const target of targets) {
          const npc = target.system.npcStats ?? {};
          const machine = target.type === "mecha" || npc.machine;
          if (target.type === "npc" && npc.noVirtualSelf && !system.implantsOnly && !system.device) {
            lines.push({ html: `<div class="tdt-target-line miss"><strong>${esc(target.name)}</strong>: no tiene VirtualSelf, el hack no le afecta.</div>` });
            continue;
          }
          if (system.implantsOnly && target.type === "npc" && !npc.implants && !npc.excess) {
            lines.push({ html: `<div class="tdt-target-line miss"><strong>${esc(target.name)}</strong>: no lleva implantes (DJ).</div>` });
            continue;
          }
          if (system.device && !machine) {
            lines.push({ html: `<div class="tdt-target-line miss"><strong>${esc(target.name)}</strong>: solo afecta a dispositivos.</div>` });
            continue;
          }
          const value = targetDefense(target, defense);
          const line = this._targetLine(target, {
            total: result.total,
            defense: value,
            damage: Number(system.damage || 0),
            endurance: targetEndurance(target, { hack: true, ignoreHuman: system.ignoreHumanEndurance, machineZero: system.machineEnduranceZero }),
            defenseKey: defense,
            options: { raw: true, hack: true }
          });
          if (line.hit && /duraci[oó]n\s*\(margen\)/i.test(system.properties)) line.html = line.html.replace("</div>", ` · Duración ${Cyber.marginDuration(line.incoming)} rondas</div>`);
          if (line.hit && /sobrecarga cromada/i.test(hack.name) && target.type === "npc") {
            const excessDifficulty = 4 + Number(npc.excess || 0);
            const will = Number(npc.will || 0);
            line.html = line.html.replace("</div>", ` · Exceso: Voluntad ${will} contra ${excessDifficulty} → ${will >= excessDifficulty ? "lo aguanta" : will <= excessDifficulty - 4 ? "se le va la pinza" : "absorto"}</div>`);
          }
          lines.push(line);
        }
        if (result.success === false || (targets.length && lines.every(line => line.hit === false))) {
          if (/(desalineado)/i.test(targets.map(target => target.name).join(" "))) notes.push("Has fallado contra un desalineado: defiéndete de un hack de dificultad 10 o quedas absorto.");
          if (!system.wired && !flags.has("netGhost")) notes.push("Rastro: el objetivo sabe que le están hackeando y, más o menos, desde dónde.");
        }
        if (Number(system.damage) && system.nonLethal) notes.push("No letal: a 0 PV queda inconsciente y estable; una máquina se destruye.");
        if (/sobrecarga cromada/i.test(hack.name)) {
          for (const target of targets.filter(target => target.type === "character")) notes.push(`${target.name} debe tirar su exceso de carga.`);
        }
        let rebound = "";
        if (result.isFumble) {
          notes.push("Pifia: el hack rebota y te come a ti (recibes sus efectos o 2 de daño ignorando el aguante, a discreción del DJ).");
          rebound = `<button type="button" class="tdt-chat-button" data-tdt-action="self-damage" data-payload="${payload({ actorUuid: this.uuid, amount: 2 })}">Rebote: recibir 2 de daño</button>`;
        }
        return { html: `${system.damage ? `<div class="tdt-roll-weapon"><strong>Daño:</strong> ${system.damage} (solo aguante natural)</div>` : ""}${lines.map(line => line.html).join("")}${notesList(notes)}${rebound}<div class="tdt-item-message">${esc(system.description)}</div>` };
      }
    }, options.preset);
  },

  async toggleHackLoaded(item) {
    const stats = this.system.cyberStats ?? {};
    const loading = !(item.system.loaded);
    if (loading && stats.usedSlots >= stats.slots) return ui.notifications.warn(`No quedan ranuras libres (${stats.usedSlots}/${stats.slots}).`);
    if (loading && item.type === "gear" && this.items.some(other => other.id !== item.id && other.type === "gear" && other.system.category === "skillChip" && other.system.loaded && other.system.chipTarget === item.system.chipTarget && (item.system.chipTarget !== "driving" || String(other.system.chipVehicle ?? "").trim().toLocaleLowerCase("es") === String(item.system.chipVehicle ?? "").trim().toLocaleLowerCase("es")))) {
      return ui.notifications.warn("No puedes cargar dos chips de la misma habilidad a la vez.");
    }
    await item.update({ "system.loaded": loading });
    if (loading && game.combat?.started) say(this, "Cargar chip", `<p>${esc(this.name)} carga ${esc(item.name)}: en combate gasta su turno entero.</p>`);
  },

  async installImplant(implantRef) {
    const implant = getItem(this, implantRef);
    if (!implant) return;
    if (implant.system.installed !== false) return this.removeImplant(implant);
    if (Cyber.isAVS(implant) && this.items.some(other => other.id !== implant.id && other.type === "implant" && other.system.installed !== false && Cyber.isAVS(other))) {
      return ui.notifications.warn("Solo puedes tener un AVS instalado.");
    }
    const choice = await choiceDialog(`Instalar ${implant.name}`, "¿Dónde se instala?", [
      { id: "clinic", label: "Clínica (1.000 € por punto de CC)" },
      { id: "alley", label: "Clínica de callejón (mitad de precio; 1d4: con un 1 sale averiado)" },
      { id: "self", label: "Tirada de Cibernética de un personaje" }
    ]);
    if (!choice) return;
    let malfunction = false;
    const cost = Cyber.implantCost(implant);
    const price = choice === "clinic" ? cost * 1000 : choice === "alley" ? cost * 500 : 0;
    const currency = currencySettings();
    if (price > Number(this.system.money || 0)) return ui.notifications.warn(`La operación cuesta ${price.toLocaleString("es-ES")} ${currency.name} y solo tienes ${Number(this.system.money || 0).toLocaleString("es-ES")} ${currency.name}.`);
    if (choice === "alley") {
      const roll = await new Roll("1d4").evaluate();
      malfunction = roll.total === 1;
      say(this, "Clínica de callejón", `<p>1d4 = ${roll.total}: ${malfunction ? `${esc(implant.name)} sale <strong>averiado</strong>.` : "todo bien."}</p>`);
    }
    if (choice === "self") {
      const surgeon = await this._chooseSurgeon();
      if (!surgeon) return;
      const tier = implant.system.tier in TDT.implantRemovalDifficulty ? implant.system.tier : Cyber.implantTierFromCost(cost);
      const result = await surgeon.rollSkill("cybernetics", { label: `Instalar ${implant.name} a ${this.name}`, difficulty: TDT.implantRemovalDifficulty[tier], scopes: ["implant-surgery"], extraRules: [{ type: "penalty", value: 2, label: "Sin kit de cibernética", optional: true }] });
      if (!result?.success) return;
    }
    if (price) await this.update({ "system.money": Number(this.system.money || 0) - price });
    await implant.update({ "system.installed": true, "system.malfunction": malfunction });
    const stats = this.system.cyberStats;
    if (stats?.excess > 0) say(this, "Exceso de carga", `<p>${esc(this.name)} tiene ahora ${stats.excess} de exceso (carga ${stats.load} / CC ${stats.cc}).</p>`);
  },

  async _chooseSurgeon() {
    const candidates = game.actors.filter(actor => actor.type === "character" && actor.isOwner);
    if (!candidates.length) return this;
    const id = await choiceDialog("Cirujano", "¿Quién opera?", [this, ...candidates.filter(actor => actor.id !== this.id)].map(actor => ({ id: actor.id, label: actor.name })));
    return id ? game.actors.get(id) : null;
  },

  async removeImplant(implantRef) {
    const implant = getItem(this, implantRef);
    if (!implant) return;
    if (implant.system.supreme?.enabled && implant.system.supreme.kind === "backup" && implant.system.supreme.used) return ui.notifications.warn("La Copia de seguridad no se puede quitar: la necesitas para seguir vivo.");
    const surgeon = await this._chooseSurgeon();
    if (!surgeon) return;
    const tier = implant.system.tier in TDT.implantRemovalDifficulty ? implant.system.tier : Cyber.implantTierFromCost(Cyber.implantCost(implant));
    const difficulty = TDT.implantRemovalDifficulty[tier] ?? 13;
    const result = await surgeon.rollSkill("cybernetics", {
      label: `Descromarse: quitar ${implant.name} a ${this.name}`,
      difficulty,
      scopes: ["implant-surgery"],
      extraRules: [{ type: "penalty", value: 2, label: "Sin kit de cibernética", optional: true }]
    });
    if (!result) return;
    if (result.success) {
      await implant.update({ "system.installed": false });
      return say(this, "Descromarse", `<p>${esc(implant.name)} sale, junto con sus mejoras. Durante unos días, el DJ puede penalizar en 1 las tiradas de esa parte del cuerpo.</p>`);
    }
    if (result.isFumble) {
      const die = surgeon.system.skills.cybernetics.value || 4;
      const roll = await new Roll(`1d${die}`).evaluate();
      await this.applyDamage(roll.total, { ignoreEndurance: true });
      return say(this, "Descromarse", `<p>Pifia: el implante sigue dentro y ${esc(this.name)} recibe ${roll.total} de daño ignorando el aguante.</p>`);
    }
    return say(this, "Descromarse", "<p>El implante sigue en su sitio. Se puede volver a intentar más adelante.</p>");
  },

  async useSupreme(implantRef) {
    const implant = getItem(this, implantRef);
    const supreme = implant?.system.supreme;
    if (!supreme?.enabled) return;
    if (supreme.kind === "backup" && supreme.used) return ui.notifications.warn("La Copia de seguridad solo funciona una vez.");
    const ok = await confirmDialog(implant.name, "Usar un implante supremo cuesta CC para siempre (o algo peor). ¿Seguro?");
    if (!ok) return;
    const lines = [];
    if (supreme.costDice) {
      const roll = await new Roll(supreme.costDice).evaluate();
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: `${implant.name}: coste de CC` });
      await this.update({ "system.cyber.ccLost": Number(this.system.cyber.ccLost || 0) + roll.total });
      lines.push(`Pierdes ${roll.total} de CC para siempre.`);
    }
    if (supreme.kind === "ans") lines.push("Juegas tres turnos seguidos.");
    if (supreme.kind === "satr") {
      await this.update({ "system.conditions.satr": true });
      lines.push("Tu siguiente tirada de combate (atacar o esquivar) bonifica en 3 y repite los 1.");
    }
    if (supreme.kind === "backup") {
      await this.update({ "system.health.value": 1, "system.dying.active": false, "system.dying.difficulty": 0 });
      await implant.update({ "system.supreme.used": true });
      lines.push("Las nanomáquinas te devuelven a la vida con 1 PV. Pierdes recuerdos: el DJ decide cuáles.");
    }
    if (supreme.kind === "ipv6") {
      lines.push("Conectas el objetivo a internet. Eva lo detecta al instante: un humano muere o queda desalineado; una máquina queda controlada por Eva (DJ).");
      const result = await this.rollHackDefense("hacking", { label: "Frontera IPv6: Eva va a por ti", difficulty: 15 });
      if (result && !result.success) lines.push("<strong>Eva te alcanza: tu personaje muere o queda desalineado.</strong>");
      else if (result) lines.push("Consigues cerrar la conexión a tiempo.");
    }
    const stats = this.system.cyberStats;
    if (stats) lines.push(`CC actual ${stats.cc}, carga ${stats.load}, exceso ${stats.excess}.`);
    return say(this, implant.name, `<p>${lines.join("<br>")}</p>`);
  },

  async suppressiveFire(weaponRef) {
    const weapon = getItem(this, weaponRef);
    if (!weapon) return;
    const ammo = Number(weapon.system.ammo?.value || 0);
    if (ammo < 3) return ui.notifications.warn("Fuego de supresión necesita 3 de munición.");
    await weapon.update({ "system.ammo.value": ammo - 3 });
    return say(this, "Fuego de supresión", `<p>${esc(this.name)} barre una zona de distancia corta con ${esc(weapon.name)}. Hasta su siguiente turno, los enemigos de esa zona penalizan en 1 sus tiradas de ataque.</p>`);
  },

  /* -------------------------------------------- */
  /*  Mechas                                       */
  /* -------------------------------------------- */

  pilotActor() {
    return this.system.pilot ? fromUuidSync(this.system.pilot) : null;
  },

  copilotActor() {
    return this.system.copilot ? fromUuidSync(this.system.copilot) : null;
  },

  async rollMechaStat(kind, options = {}) {
    const pilot = this.pilotActor();
    if (!pilot) return ui.notifications.warn("Este mecha no tiene piloto asignado.");
    const copilot = this.copilotActor();
    const flags = this.tdtFlags;
    const dice = this.system.dice;
    const pilotDie = actor => {
      const attributes = actor.system.attributes;
      // Robustez: Potencia o Fortaleza del piloto. Maniobra táctica: su Esquiva (Mechasinapsis: Mente en lugar de Destreza).
      if (kind === "robustness") return Math.max(attributes.power.value, actor.system.defenses.fortitude.value);
      if (flags.has("mechasynapse")) return Math.max(attributes.mind.value, actor.system.defenses.evasion.value);
      return Math.max(attributes.dexterity.value, actor.system.defenses.evasion.value);
    };
    const labels = { robustness: "Robustez", maneuver: "Maniobra táctica", perception: "Percepción" };
    if (kind === "perception") {
      if (this.system.aiCameras) {
        return this.rollCheck({ kind: "mecha", label: "Percepción (cámaras con IA)", scopes: ["perception", "mecha"], first: { label: "Cámaras", faces: 10 }, second: { label: "Cámaras", faces: 10 }, linkedDice: true, difficulty: options.difficulty ?? 0, reroll: { method: "rollMechaStat", args: [kind, {}] } }, options.preset);
      }
      return pilot.rollPerception(options);
    }
    const willLink = (kind === "robustness" && (flags.has("willLinkMelee") || flags.has("willLinkDefense"))) || (kind === "maneuver" && flags.has("willLinkDefense"));
    const secondFaces = kind === "robustness" ? dice.robustness : dice.maneuver;
    return this.rollCheck({
      kind: "mecha",
      label: options.label ?? labels[kind],
      scopes: [kind, "mecha", ...(options.scopes ?? [])],
      primaryScope: kind,
      secondaryScope: kind,
      first: { label: `Piloto (${pilot.name})`, faces: pilotDie(pilot), alternatives: copilot ? [{ label: `Copiloto (${copilot.name})`, faces: pilotDie(copilot) }] : [] },
      second: { label: labels[kind], faces: secondFaces },
      third: willLink ? { label: "Voluntad del piloto", faces: pilot.system.defenses.will.value } : null,
      difficulty: options.difficulty ?? 0,
      reroll: { method: "rollMechaStat", args: [kind, {}] },
      after: outcome => this._mechaAfter(outcome, pilot)
    }, options.preset);
  },

  _mechaAfter(outcome, pilot, extraHtml = "") {
    const drain = outcome.options.linkWill
      ? `<button type="button" class="tdt-chat-button" data-tdt-action="drain-will" data-payload="${payload({ pilotUuid: pilot.uuid, difficulty: 8 })}">Drenaje de voluntad (Voluntad 8)</button>`
      : "";
    return { html: `${extraHtml}${drain}` };
  },

  async drainWill(difficulty = 8) {
    const result = await this.rollDefense("will", { label: "Drenaje de voluntad", difficulty });
    if (!result || result.success) return;
    const loss = Math.max(0, difficulty - result.total);
    const health = Math.max(0, Number(this.system.health.value) - loss);
    await this.update({ "system.health.value": health });
    return say(this, "Drenaje de voluntad", `<p>${esc(this.name)} pierde ${loss} PV.${health === 0 ? " Queda exhausto e inconsciente." : ""}</p>`);
  },

  async rollMechaWeapon(itemRef, options = {}) {
    const item = getItem(this, itemRef);
    if (!item) return null;
    if (item.system.mecha?.destroyed) return ui.notifications.warn(`${item.name} está destruida y no puede volver a usarse.`);
    if (item.system.mecha?.repairRequired) return ui.notifications.warn(`${item.name} está averiada: repárala antes de atacar.`);
    const pilot = this.pilotActor();
    if (!pilot) return ui.notifications.warn("Este mecha no tiene piloto asignado.");
    const copilot = this.copilotActor();
    const flags = this.tdtFlags;
    const profile = this.weaponProfile(item);
    const props = profile.props;
    const resource = Number(item.system.ammo?.max || 0) > 0;
    if (!options.preset && resource && Number(item.system.ammo.value) <= 0) return ui.notifications.warn(`${item.name} necesita recargar (gasta una acción y una batería o caja de munición).`);
    const moduleKey = item.system.mecha?.module || "melee";
    const moduleDie = Number(this.system.modules[moduleKey] || 4);
    const skillKey = item.system.skill || "brawl";
    const pilotSkill = actor => Number(actor.system.skills[skillKey]?.value || 0);
    const extraRules = [];
    if (Number(item.system.mecha?.overloadPenalty)) extraRules.push({ type: "penalty", value: Number(item.system.mecha.overloadPenalty), label: "Secuelas de sobrecarga" });
    const primaryExists = this.items.some(other => other.type === "weapon" && other.system.mecha?.primary);
    let moduleStep = 0;
    if (flags.has("primaryWeapon") && primaryExists) {
      if (item.system.mecha?.primary) {
        if (moduleDie === 12) extraRules.push({ type: "bonus", value: 1, label: "Arma principal mejorada" });
        else moduleStep = 1;
      } else extraRules.push({ type: "penalty", value: 1, label: "Arma principal mejorada (otras armas)" });
    }
    if (flags.has("unstableWeapons")) extraRules.push({ type: "dieStep", value: -1, target: "both", label: "Sistema de armas inestable (misma arma que el turno anterior; no bonificable)", optional: true, noBonus: true });
    if (profile.penalty) extraRules.push({ type: "penalty", value: profile.penalty, label: "Penalizador del arma" });
    const targets = currentTargets();
    const defenseKey = item.system.defense || "evasion";
    if (!options.preset && warnIfAllImmune(targets, defenseKey)) return null;
    const isMelee = moduleKey === "melee";
    const willLink = isMelee && flags.has("willLinkMelee");
    const multi = props.multiHit;
    const extraFields = [
      multi ? `<div class="form-group"><label>Impactos adicionales declarados (máx. ${multi.max || multi.formula})</label><input type="number" name="hits" min="0" max="${multi.max || 9}" value="${multi.max || 0}"><p class="hint">Golpe múltiple(${esc(multi.formula)}, ${multi.damage}): cada impacto efectivo suma ${multi.damage} tras el aguante.</p></div>` : "",
      isMelee ? `<div class="form-group"><label>Carga (primer golpe, desde distancia media)</label><input type="checkbox" name="charge"></div>` : "",
      props.startup ? `<div class="form-group"><label>Arrancar el arma (gasta ${props.startup})</label><input type="checkbox" name="startup"></div>` : "",
      targets.length ? `<p class="hint">Objetivos: ${targets.map(target => esc(target.name)).join(", ")}.</p>` : ""
    ].join("");
    const single = targets.length === 1 ? targetDefense(targets[0], defenseKey) : null;
    return this.rollCheck({
      kind: "mechaWeapon",
      label: `${this.name}: ${item.name}`,
      subtitle: `${TDT.mechaModules[moduleKey]} + ${pilot.system.skills[skillKey]?.label ?? skillKey}`,
      scopes: ["attack", "mecha", "mecha-attack", skillKey, isMelee ? "melee-attack" : "ranged-attack"],
      primaryScope: skillKey,
      secondaryScope: moduleKey,
      first: { label: `${pilot.name}: ${pilot.system.skills[skillKey]?.label ?? skillKey}`, faces: pilotSkill(pilot), allowZero: true, alternatives: copilot ? [{ label: `Copiloto ${copilot.name}`, faces: pilotSkill(copilot) }] : [] },
      second: { label: TDT.mechaModules[moduleKey], faces: stepDie(moduleDie, moduleStep) },
      third: willLink ? { label: "Voluntad del piloto", faces: pilot.system.defenses.will.value } : null,
      minimumFaces: !isMelee && this.system.aiCameras ? 6 : 0,
      difficulty: single ?? 0,
      automaticDifficulty: automaticDifficultyText(targets, defenseKey),
      extraRules,
      extraFields,
      readExtra: (form, data) => ({ hits: Number(data.get("hits") || 0), charge: Boolean(data.get("charge")), startup: Boolean(data.get("startup")) }),
      reroll: { method: "rollMechaWeapon", args: [item.id, {}] },
      after: async outcome => {
        const { result } = outcome;
        const extra = outcome.options.extra ?? {};
        const notes = [...profile.notes];
        let damage = profile.damage;
        if (extra.charge) {
          const bonus = Mecha.chargeBonus(props, this.system.category, flags.has("thruster"));
          damage += bonus;
          notes.push(`Carga: Daño +${bonus}. Si falla, penalizador de 3 al siguiente ataque del objetivo contra ti.`);
        }
        let afterEndurance = 0;
        if (multi && extra.hits && (result.margin === null || result.margin >= 1)) {
          let rolled = null;
          if (/d/i.test(multi.formula)) {
            const roll = await new Roll(multi.formula.replace(/\s/g, "")).evaluate();
            rolled = roll.total;
            notes.push(`Golpe múltiple: ${multi.formula} = ${Math.floor(roll.total)}.`);
          }
          const hits = Mecha.resolveMultiHit(props, extra.hits, rolled);
          afterEndurance = hits.damage;
          notes.push(`Impactos adicionales efectivos: ${hits.hits} de ${extra.hits} declarados (+${hits.damage} tras el aguante).`);
        }
        if (props.pierce && result.isCritical) notes.push("Perfora: si inflige al menos 1 PV, el objetivo pierde 1 de aguante (máximo 3 veces).");
        if (props.cooldown) notes.push("Enfriamiento: no se puede usar el siguiente turno.");
        if (props.support && flags.has("flying") && !flags.has("airSupport")) notes.push("Soporte: no puede dispararse volando sin perder el control.");
        if (resource && !options.preset) {
          const spent = extra.startup && props.startup ? props.startup : 1;
          await item.update({ "system.ammo.value": Math.max(0, Number(item.system.ammo.value) - spent) });
        }
        const lines = targetLines(this, outcome, targets, { defenseKey, damage, afterEndurance, endurance: target => targetEndurance(target) });
        const html = `<div class="tdt-roll-weapon"><strong>Daño:</strong> ${damage} · ${esc(item.system.properties || "")}</div>${lines.map(line => line.html).join("")}${notesList(notes)}`;
        return this._mechaAfter(outcome, pilot, html);
      }
    }, options.preset);
  },

  async mechaOverload(itemRef) {
    const item = getItem(this, itemRef);
    if (!item) return;
    if (item.system.mecha?.destroyed) return ui.notifications.warn(`${item.name} está destruida.`);
    if (item.system.mecha?.repairRequired || item.system.mecha?.overloadPenalty) return ui.notifications.warn(`${item.name} conserva daños de una sobrecarga anterior: repárala primero.`);
    if (parseWeaponProperties(item.system.properties).hand) return ui.notifications.warn("Las armas con la etiqueta Mano no se pueden sobrecargar.");
    const integrated = item.system.mecha?.integrated !== false;
    const roll = await new Roll("1d6").evaluate();
    const category = Number(this.system.category || 1);
    const text = Mecha.overloadResult(roll.total, integrated);
    const loss = integrated ? ({ 1: 2 * category, 2: category, 3: category }[roll.total] ?? 0) : 0;
    const penalty = integrated
      ? ({ 3: 2, 4: 2, 5: 1 }[roll.total] ?? 0)
      : ({ 3: 3, 4: 2, 5: 1 }[roll.total] ?? 0);
    const repairRequired = integrated ? roll.total <= 2 : roll.total === 2;
    const destroyed = !integrated && roll.total === 1;
    const repairCost = !integrated && roll.total === 2 ? 2 : (repairRequired || penalty ? 1 : 0);
    if (loss) await this.update({ "system.health.value": Math.max(0, Number(this.system.health.value) - loss) });
    await item.update({
      "system.mecha.overloadPenalty": penalty,
      "system.mecha.repairRequired": repairRequired,
      "system.mecha.destroyed": destroyed,
      "system.mecha.repairCost": repairCost
    });
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${card(`Sobrecarga: ${item.name}`, `<p>Dos ataques completos, o un ataque contra el mismo objetivo con Daño inicial +${2 + (parseWeaponProperties(item.system.properties).size || 0)}.</p><p><strong>${roll.total}:</strong> ${esc(text)}${loss ? ` (−${loss} PV aplicados)` : ""}</p><p>La reparación cuesta 1 punto del kit de reparación de mechas.</p>`)}`
    });
  },

  async mechaRepairWeapon(itemRef) {
    const item = getItem(this, itemRef);
    if (!item) return;
    if (item.system.mecha?.destroyed) return ui.notifications.warn(`${item.name} fue destruida por la sobrecarga y no puede repararse.`);
    const cost = Math.max(1, Number(item.system.mecha?.repairCost || 1));
    const kit = this.items.find(other => other.type === "gear" && /kit de reparaci[oó]n/i.test(other.name) && Number(other.system.uses?.value || 0) >= cost);
    if (!kit) return ui.notifications.warn(`Reparar ${item.name} requiere ${cost} ${cost === 1 ? "carga" : "cargas"} de un kit de reparación.`);
    await kit.update({ "system.uses.value": Number(kit.system.uses.value) - cost });
    await item.update({
      "system.mecha.overloadPenalty": 0,
      "system.mecha.repairRequired": false,
      "system.mecha.repairCost": 0
    });
    return say(this, `Reparación: ${item.name}`, `<p>El arma vuelve a estar operativa. ${esc(kit.name)} gasta ${cost} ${cost === 1 ? "carga" : "cargas"}.</p>`);
  },

  async mechaReload(itemRef) {
    const item = getItem(this, itemRef);
    if (!item) return;
    const props = parseWeaponProperties(item.system.properties);
    const isBattery = props.battery > 0;
    const supply = this.items.find(other => other.type === "gear" && Number(other.system.quantity) > 0 && (isBattery ? /bater[ií]a adicional/i : /caja de munici[oó]n/i).test(other.name));
    if (!supply) return ui.notifications.warn(`No quedan ${isBattery ? "baterías adicionales" : "cajas de munición"} en el inventario del mecha.`);
    await supply.update({ "system.quantity": Number(supply.system.quantity) - 1 });
    await item.update({ "system.ammo.value": item.system.ammo.max });
    const failure = this.tdtFlags.has("ammoFeedFailure") ? await new Roll("1d6").evaluate() : null;
    const failed = failure && failure.total <= 3;
    return say(this, `Recarga: ${item.name}`, `<p>Gasta una acción entera y ${esc(supply.name)}.${failed ? ` Módulo de captación fallido (d6 = ${failure.total}): la recarga falla, gasta tu ataque para corregirlo.` : ""}</p>`);
  },

  /** Optional damage table: losing 6 + 2 × category HP in one attack, or fumbling a defense. */
  async _mechaDamageCheck(damage, { fumble = false } = {}) {
    if (!rule("mechaDamage")) return;
    const threshold = 6 + 2 * Number(this.system.category || 1);
    if (!fumble && (damage <= 0 || damage < threshold)) return;
    const roll = await new Roll("1d8").evaluate();
    const pilot = this.pilotActor();
    const pilotButton = roll.total === 7 && pilot
      ? `<button type="button" class="tdt-chat-button" data-tdt-action="apply-damage" data-payload="${payload({ targetUuid: pilot.uuid, amount: damage, options: {} })}">Aplicar ${damage} al piloto (resta su aguante)</button>`
      : "";
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this }), flavor: card("Daños en el mecha", `<p>${fumble ? `${esc(this.name)} pifia al defenderse${damage ? ` y pierde ${damage} PV` : ""}.` : `${esc(this.name)} pierde ${damage} PV (umbral ${threshold}).`}</p><p><strong>${roll.total}:</strong> ${esc(TDT.mechaDamageTable[roll.total])}</p>${pilotButton}`) });
  },

  async upgradeMechaModule(key, direction = 1) {
    const current = normalizeDie(this.system.modules[key]) || 4;
    const index = DIE_SIZES.indexOf(current) + direction;
    const limit = Number(rule("mechaModuleLimit") || 12);
    if (index < 0 || index >= DIE_SIZES.length || DIE_SIZES[index] > limit) return;
    const next = DIE_SIZES[index];
    if (direction > 0) {
      const cost = dieScore(next) + Number(this.system.category || 1);
      if (cost > this.system.inventory.remaining) return ui.notifications.warn(`Subir a d${next} cuesta ${cost} puntos de inventario y quedan ${this.system.inventory.remaining}.`);
    }
    await this.update({ [`system.modules.${key}`]: next });
  }
};

for (const [name, fn] of Object.entries(methods)) {
  Object.defineProperty(TDTActor.prototype, name, { value: fn, writable: true, configurable: true });
}
