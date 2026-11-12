import { TDT } from "./config.mjs";
import { currencySettings, moduleActive, rule, skillVisible } from "./settings.mjs";
import { packEnabled, packModule } from "./content.mjs";
import { dieScore } from "./dice.mjs";
import * as Fantasy from "./modules/fantasy.mjs";
import * as Cyber from "./modules/cyber.mjs";
import * as Mecha from "./modules/mecha.mjs";
import * as Vehicle from "./modules/vehicle.mjs";
import { parseWeaponProperties } from "./attack.mjs";
import { categoriesForType, pickerCategory, PICKER_CATEGORIES } from "./compendium-picker.mjs";
import { CHIP_KINDS, chipKindOf, chipTargetsFor } from "./chips.mjs";
import { confirmDialog, tdtDialog } from "./dialogs.mjs";
import { dieLabel, IMPROVABLE_KINDS } from "./experience.mjs";
import { actionGroups, runHubEntry } from "./action-hub.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const ITEM_IMAGES = {
  feat: "systems/tdt/assets/icons/feat.svg",
  weapon: "systems/tdt/assets/icons/weapon.svg",
  armor: "systems/tdt/assets/icons/armor.svg",
  gear: "systems/tdt/assets/icons/gear.svg",
  race: "systems/tdt/assets/icons/race.svg",
  spell: "systems/tdt/assets/icons/spell.svg",
  power: "systems/tdt/assets/icons/power.svg",
  implant: "systems/tdt/assets/icons/implant.svg",
  hack: "systems/tdt/assets/icons/hack.svg"
};

function modulesContext() {
  return Object.fromEntries(Object.keys(TDT.modules).map(key => [key, moduleActive(key)]));
}

function sheetConfig() {
  return {
    ...TDT,
    dieChoices: { 0: "+1", 4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12" },
    rolledDieChoices: { 4: "d4", 6: "d6", 8: "d8", 10: "d10", 12: "d12" },
    attributeChoices: TDT.attributes,
    attributeAltChoices: { "": "Ninguna", ...TDT.attributes },
    perChoices: { day: "Día", rest: "Descanso", scene: "Escena", combat: "Combate", session: "Sesión" },
    magicModes: { simple: "Magia sencilla", circles: "Círculos mágicos" },
    magicSkills: { arcana: "Arcano", nature: "Naturaleza", religion: "Religión" },
    supremeKinds: { "": "—", ipv6: "Frontera IPv6", ans: "ANS", satr: "SATR", backup: "Copia de seguridad" },
    powerComplexity: { simple: "Sencillo", complex: "Complejo", ultimate: "Definitivo" },
    defenseChoices: TDT.attackDefenses,
    hackDefenseChoices: TDT.hackDefenses,
    moduleChoices: { "": "Básico", ...TDT.modules },
    skillChoices: Object.fromEntries(Object.entries(TDT.skills).filter(([key]) => skillVisible(key))),
    // Chips can target every skill, including skills hidden by the current module mix, plus driving and defenses.
    chipTargets: { "": "—", ...TDT.skills, driving: "Conducir (dote)", evasion: "Esquiva", fortitude: "Fortaleza", will: "Voluntad" }
  };
}

function itemSummary(item, actor) {
  const system = item.system;
  switch (item.type) {
    case "weapon": {
      const parts = [`Daño ${system.damage}`];
      if (/consumible/i.test(system.properties ?? "")) parts.push(`×${Number(system.quantity ?? 1)}`);
      if (Number(system.ammo?.max)) parts.push(`${system.ammo.value}/${actor?.weaponProfile ? actor.weaponProfile(item).ammoMax : system.ammo.max}`);
      if (moduleActive("cyber") || rule("weaponCondition")) parts.push(TDT.weaponConditions[system.condition || "normal"]);
      if (actor?.type === "npc" && system.attackDifficulty) parts.unshift(`Ataque ${system.attackDifficulty}`);
      return parts.join(" · ");
    }
    case "armor": {
      const damage = Number(system.damage || 0);
      const base = Math.max(0, Number(system.endurance || 0) - damage);
      const pristine = moduleActive("cyber") && system.pristine && base > 0 ? 1 : 0;
      const effective = base + pristine;
      const shotBase = Number(system.shotEndurance || 0);
      const effectiveShot = (shotBase ? Math.max(0, shotBase - damage) : base) + pristine;
      const parts = [`Aguante +${effective}`];
      if (shotBase && effectiveShot !== effective) parts.push(`disparos +${effectiveShot}`);
      if (pristine) parts.push("Impoluta");
      if (!effective && Number(system.endurance || 0) > 0) parts.push("Rota");
      return parts.join(" · ");
    }
    case "feat":
      return `${system.cost >= 0 ? "+" : ""}${system.cost}${system.incremental ? ` · Incremental ${system.incremental}` : ""}`;
    case "gear":
      if (system.category === "vehicle") {
        const vehicle = Vehicle.vehicleProfile(item);
        return `PV ${vehicle.health.value}/${vehicle.health.max} · Aguante ${vehicle.endurance} · Conducción ${vehicle.modifier >= 0 ? "+" : ""}${vehicle.modifier}`;
      }
      return `${TDT.gearCategories[system.category] ?? ""}${Number(system.quantity) !== 1 ? ` ×${system.quantity}` : ""}`;
    case "implant":
      return system.supreme?.enabled ? `Supremo · ${system.supreme.costDice || "sin coste"}` : `${Cyber.implantCost(item)} CC${system.malfunction ? " · averiado" : ""}${system.offline ? " · sin funcionar" : ""}`;
    case "hack":
      return `${TDT.hackDefenses[system.defense] ?? ""}${system.damage ? ` · Daño ${system.damage}` : ""}${system.neuralOverload ? " · Sobrecarga" : ""}`;
    case "power":
      return `${system.permanent ? "Permanente" : `${system.energyCost}${system.variableCost ? "+X" : ""} energía`}${system.cursed ? " · Maldito" : ""}`;
    case "spell": {
      const cost = Fantasy.circleCost(system, { feats: Fantasy.knownCircleParts(actor).feats, hasFocus: actor.system.fantasy?.hasFocus });
      return `Dif. ${cost.difficulty} · ${cost.mana} maná`;
    }
    default:
      return "";
  }
}

/* -------------------------------------------- */
/*  Shared ApplicationV2 behaviour               */
/* -------------------------------------------- */

const normalize = text => String(text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("es");

/**
 * Behaviour shared by every TDT sheet: one Handlebars part, a "primary" tab group kept across renders,
 * and the data-action names of the templates dispatched to instance methods.
 */
const TDTSheetMixin = Base => class extends HandlebarsApplicationMixin(Base) {
  static TABS = { primary: { initial: "main", tabs: [] } };

  /** Map of data-action → method name. Subclasses extend it. */
  static ACTIONS = {};

  /** Clicks on the icon or the label of a tab also change the tab (the core handler reads event.target). */
  _onClickTab(event) {
    const button = event.target.closest("[data-tab]");
    if (!button || button.classList.contains("active") || event.button !== 0) return;
    this.changeTab(button.dataset.tab, button.dataset.group || "primary", { event, navElement: button.closest(".tabs") });
  }

  /** Legacy action names of the templates ("item-edit", "weapon-roll"…), without a static handler. */
  _onClickAction(event, target) {
    const method = this.constructor.ACTIONS[target.dataset.action];
    if (!method || typeof this[method] !== "function") return super._onClickAction?.(event, target);
    event.preventDefault();
    return this[method](event, target);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    // Keep the active tab after every render; fall back to the first tab if it disappeared (module disabled).
    const group = "primary";
    const wanted = this.tabGroups[group];
    const exists = tab => tab && root.querySelector(`.tabs [data-group="${group}"][data-tab="${tab}"]`);
    const tab = exists(wanted) ? wanted : root.querySelector(`.tabs [data-group="${group}"][data-tab]`)?.dataset.tab;
    if (tab) this.changeTab(tab, group, { force: true, updatePosition: false });
    for (const button of root.querySelectorAll("button[title]:not([aria-label])")) button.setAttribute("aria-label", button.title);
    for (const input of root.querySelectorAll("[data-filter-list]")) input.addEventListener("input", event => this._filterList(event));
    for (const link of root.querySelectorAll("a[data-action]")) {
      link.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        link.click();
      });
    }
  }

  _filterList(event) {
    const input = event.currentTarget;
    const scope = input.closest(".tab") ?? this.element;
    const query = normalize(input.value);
    let visible = 0;
    for (const row of scope?.querySelectorAll(".tdt-item-list li[data-item-id], .tdt-skill-row") ?? []) {
      const hidden = Boolean(query) && !normalize(row.textContent).includes(query);
      row.classList.toggle("filtered-out", hidden);
      if (!hidden) visible += 1;
    }
    const clear = input.closest(".tdt-list-toolbar")?.querySelector("[data-action='filter-clear']");
    if (clear) clear.hidden = !query;
    let empty = scope?.querySelector(".tdt-filter-empty");
    if (query && !visible && scope) {
      if (!empty) {
        empty = document.createElement("p");
        empty.className = "tdt-filter-empty";
        scope.append(empty);
      }
      empty.textContent = `No hay resultados para «${input.value.trim()}».`;
    } else empty?.remove();
  }

  _clearFilter(event, target) {
    const toolbar = target.closest(".tdt-list-toolbar");
    const input = toolbar?.querySelector("[data-filter-list]");
    if (!input) return;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  _toggleSection(event, target) {
    const section = target.closest(".tdt-section");
    section?.classList.toggle("collapsed");
    target.setAttribute("aria-expanded", String(!section?.classList.contains("collapsed")));
  }

  _activateTab(event, target) {
    this.changeTab(target.dataset.tab, "primary");
  }
};

/** Rows of an array edited in a form arrive as an object keyed by index. */
function rowsFromForm(value, current, map) {
  if (!value || Array.isArray(value)) return value;
  return Object.keys(value).sort((a, b) => a - b).map(index => map({ ...(current?.[index] ?? {}), ...value[index] }));
}

/* -------------------------------------------- */
/*  Character and NPC sheet                      */
/* -------------------------------------------- */

export class TDTActorSheet extends TDTSheetMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["tdt", "sheet", "actor"],
    position: { width: 860, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    sheet: { template: "systems/tdt/templates/actor-sheet.hbs", scrollable: [".sheet-body .tab"] }
  };

  static ACTIONS = {
    "filter-clear": "_clearFilter",
    "section-toggle": "_toggleSection",
    "activate-tab": "_activateTab",
    "item-edit": "_editItem",
    "item-chat": "_chatItem",
    "damage": "_damageDialog",
    "heal": "_healDialog",
    "item-create": "_createItem",
    "compendium-pick": "_pickFromCompendium",
    "item-delete": "_deleteItem",
    "item-toggle": "_toggleItem",
    "item-use": "_useItem",
    "weapon-roll": "_rollWeapon",
    "reputation-add": "_addReputation",
    "reputation-delete": "_deleteReputation",
    "roll-skill": "_rollSkill",
    "roll-defense": "_rollDefense",
    "roll-perception": "_rollPerception",
    "actor-method": "_callActorMethod",
    "improve": "_improve",
    "improve-menu": "_improveMenu",
    "hub-run": "_runHub"
  };

  /** The editable actions; everything else (open, filter, show in chat) also works on a read-only sheet. */
  static EDIT_ACTIONS = new Set(["damage", "heal", "item-create", "compendium-pick", "item-delete", "item-toggle", "item-use", "weapon-roll", "reputation-add", "reputation-delete", "roll-skill", "roll-defense", "roll-perception", "actor-method", "improve", "improve-menu", "hub-run"]);

  _onClickAction(event, target) {
    if (this.constructor.EDIT_ACTIONS.has(target.dataset.action) && !this.isEditable) return;
    return super._onClickAction(event, target);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system;
    context.actor = actor;
    context.system = system;
    context.config = sheetConfig();
    context.modules = modulesContext();
    context.currency = currencySettings();
    context.isNPC = actor.type === "npc";
    context.isGM = game.user.isGM;
    context.actorTypeLabel = context.isNPC ? "PNJ" : "Personaje";
    const hasActiveModules = Object.values(context.modules).some(Boolean);
    const hasSceneUses = actor.items.some(item => Number(item.system.uses?.max) > 0 && ["scene", "combat"].includes(item.system.uses.per));
    const isCharacter = actor.type === "character";
    context.creation = {
      active: isCharacter && !system.creation?.done,
      reopen: isCharacter && Boolean(system.creation?.done) && game.user.isGM
    };
    const improvements = isCharacter ? actor.experienceOptions() : [];
    const improveOf = (kind, key) => improvements.find(entry => entry.kind === kind && entry.key === key);
    context.xpLog = (system.experience?.log ?? []).slice().reverse().map(entry => ({
      label: entry.label,
      detail: entry.kind === "feat" ? "Dote" : `${dieLabel(entry.from)} → d${entry.to}`,
      costText: entry.cost >= 0 ? `−${entry.cost} XP` : `+${-entry.cost} XP`
    }));
    context.quickActions = {
      improve: isCharacter,
      rest: !context.isNPC,
      newScene: context.modules.cyber || (hasActiveModules && hasSceneUses),
      fallDamage: !context.isNPC
    };
    context.quickActions.visible = Object.values(context.quickActions).some(Boolean);
    const modifierSources = target => actor._tdtMods?.sources?.[target] ?? [];
    const chipSources = target => actor.items
      .filter(item => item.type === "gear" && item.system.category === "skillChip" && item.system.loaded && item.system.chipTarget === target)
      .map(item => item.name);
    const sourceText = (...sources) => [...new Set(sources.flat().filter(Boolean))].join(", ");
    context.skills = Object.entries(system.skills)
      .filter(([key]) => skillVisible(key))
      .map(([key, skill]) => ({ key, ...skill, dieLabel: dieLabel(skill.die), improve: improveOf("skill", key), stepped: Number(skill.value) !== Number(skill.die), source: sourceText(modifierSources(`step.skill.${key}`), chipSources(key)) }));
    context.attributes = Object.entries(system.attributes).map(([key, attribute]) => ({ key, ...attribute, improve: improveOf("attribute", key), stepped: Number(attribute.value) !== Number(attribute.die), source: sourceText(modifierSources(`step.attribute.${key}`)) }));
    context.defenses = Object.entries(system.defenses).map(([key, defense]) => ({ key, ...defense, improve: improveOf("defense", key), stepped: Number(defense.value) !== Number(defense.die), source: sourceText(modifierSources(`step.defense.${key}`), chipSources(key)) }));
    const decorate = item => ({ id: item.id, name: item.name, img: item.img, type: item.type, system: item.system, summary: itemSummary(item, actor), active: item.system.equipped || item.system.loaded || item.system.installed || item.system.active });
    const ofType = type => actor.items.filter(item => item.type === type).sort((a, b) => (a.sort || 0) - (b.sort || 0)).map(decorate);
    const sections = [
      { type: "weapon", label: "Armas", items: ofType("weapon") },
      { type: "armor", label: "Armaduras", items: ofType("armor") },
      { type: "gear", label: "Objetos", items: ofType("gear").filter(item => item.system.category !== "skillChip") },
      { type: "feat", label: "Dotes", items: ofType("feat") }
    ];
    if (context.modules.fantasy && rule("races")) sections.unshift({ type: "race", label: "Raza", items: ofType("race") });
    context.sections = sections.map(section => ({ ...section, count: section.items.length }));
    const healthMax = Number(system.health.effectiveMax ?? system.health.max ?? 1);
    context.healthPercent = clamp((Number(system.health.value) / Math.max(1, healthMax)) * 100, 0, 100);

    if (context.modules.fantasy) {
      const mode = rule("magicMode");
      context.fantasy = {
        allowChoice: mode === "both",
        mode: mode === "both" ? system.fantasy.magicMode : mode,
        simpleSpells: actor.items.filter(item => item.type === "feat" && (Number(item.system.incremental) || item.system.attack?.enabled || Number(item.system.sacrifice))).map(decorate),
        circles: ofType("spell"),
        reserveFree: Math.max(0, Number(system.fantasy.reserveMax || 0) - Number(system.fantasy.incremental.reserveUsed || 0)),
        known: (() => {
          const parts = Fantasy.knownCircleParts(actor);
          return {
            roots: [...parts.roots].map(key => TDT.circleRoots[key]?.label).join(", ") || "ninguna",
            modifiers: [...parts.modifiers].map(key => TDT.circleModifiers[key]?.label).join(", ") || "ninguno"
          };
        })()
      };
    }
    if (context.modules.powers) {
      context.powers = { items: ofType("power"), weakPoint: rule("weakPoint") };
    }
    if (context.modules.zombie) {
      const z = Number(system.zombie.zombification || 0);
      const h = Number(system.zombie.hunger || 0);
      context.zombie = {
        zombificationText: z ? TDT.zombification[z] : "Sin infectar.",
        hungerText: h ? TDT.hunger[h] : "Bien alimentado.",
        terror: rule("zombieTerror"),
        group: system.zombie.group
      };
    }
    if (context.modules.cyber) {
      const stats = system.cyberStats ?? {};
      context.cyber = {
        stats,
        overloaded: stats.excess > 0,
        implants: ofType("implant").filter(item => !item.system.supreme?.enabled),
        supremes: ofType("implant").filter(item => item.system.supreme?.enabled),
        hacks: ofType("hack"),
        chips: ofType("gear").filter(item => item.system.category === "skillChip"),
        reputation: rule("cyberReputation"),
        reputationEntries: (system.cyber.reputation ?? []).map((entry, index) => ({ ...entry, index })),
        overloadLimit: actor.tdtFlags.has("overclocking") ? 2 : 1
      };
    }
    context.dying = system.dying?.active;
    context.actionGroups = actionGroups(actor);
    return context;
  }

  _itemFromTarget(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return this.actor.items.get(id);
  }

  _editItem(event, target) {
    this._itemFromTarget(target)?.sheet.render({ force: true });
  }

  _rollSkill(event, target) {
    return this.actor.rollSkill(target.dataset.skill);
  }

  _rollDefense(event, target) {
    return this.actor.rollDefense(target.dataset.defense);
  }

  _rollPerception() {
    return this.actor.rollPerception();
  }

  _improve(event, target) {
    return this.actor.improve(target.dataset.kind, target.dataset.key, { confirm: true });
  }

  /** "Mejorar": every die with the cost of its next step, plus buying feats with experience. */
  async _improveMenu() {
    const actor = this.actor;
    const available = Number(actor.system.experience.value || 0);
    const options = actor.experienceOptions();
    const groups = Object.entries(IMPROVABLE_KINDS).map(([kind, label]) => {
      const rows = options.filter(option => option.kind === kind).map(option => {
        const id = `${option.kind}.${option.key}`;
        const disabled = !option.affordable ? "disabled" : "";
        const costText = option.max ? "máximo" : `${option.cost} XP${option.half ? " · mitad" : ""}`;
        return `<label class="tdt-improve-option ${option.affordable ? "" : "unavailable"}"><input type="radio" name="choice" value="${id}" ${disabled}>
          <span class="tdt-improve-name">${esc(option.label)}</span>
          <span class="tdt-improve-dice">${dieLabel(option.die)}${option.next ? ` → d${option.next}` : ""}</span>
          <strong class="tdt-improve-cost">${costText}</strong></label>`;
      }).join("");
      return `<fieldset class="tdt-improve-group"><legend>${label === "Habilidad" ? "Habilidades" : label === "Característica" ? "Características" : "Dados defensivos"}</legend>${rows}</fieldset>`;
    }).join("");
    const choice = await tdtDialog({
      title: `Mejorar: ${actor.name}`,
      width: 560,
      classes: ["tdt-improve-dialog"],
      content: `<p class="tdt-improve-available">Experiencia disponible: <strong>${available} XP</strong></p>
        <p class="hint">Característica o dado defensivo: el doble del dado siguiente. Habilidad: el dado siguiente. Las opciones en gris no te las puedes permitir todavía.</p>
        <div class="tdt-improve-list">${groups}</div>`,
      buttons: [
        { action: "improve", label: "Mejorar", icon: "fas fa-arrow-up", default: true, callback: form => form.elements.choice?.value || form.querySelector('input[name="choice"]:checked')?.value || null },
        { action: "feat", label: "Comprar dote…", icon: "fas fa-star", callback: () => "feat" },
        { action: "cancel", label: "Cancelar" }
      ],
      render: (form, dialog) => {
        const button = dialog.element.querySelector('button[data-action="improve"]');
        const sync = () => { if (button) button.disabled = !form.querySelector('input[name="choice"]:checked'); };
        form.addEventListener("change", sync);
        sync();
      }
    });
    if (!choice) return;
    if (choice === "feat") {
      const picker = document.createElement("button");
      picker.dataset.itemType = "feat";
      return this._pickFromCompendium(null, picker);
    }
    const [kind, key] = choice.split(".");
    return actor.improve(kind, key);
  }

  _runHub(event, target) {
    return runHubEntry(target.dataset.payload, { fast: event.shiftKey });
  }

  _rollWeapon(event, target) {
    const item = this._itemFromTarget(target);
    if (item) return this.actor.rollWeapon(item);
  }

  /** data-action="actor-method" data-method="rest" [data-arg="…"]: calls a method of the actor (with the item id of its row, if any). */
  async _callActorMethod(event, target) {
    const method = target.dataset.method;
    if (typeof this.actor[method] !== "function") return;
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const arg = target.dataset.arg;
    if (itemId) return this.actor[method](itemId, ...(arg !== undefined ? [arg] : []));
    return arg !== undefined ? this.actor[method](arg) : this.actor[method]();
  }

  async _createItem(event, target) {
    const { itemType: type, category } = target.dataset;
    const name = TDT.itemTypes[type] ?? "Objeto";
    const data = { name: `${name} nuevo`, type, img: ITEM_IMAGES[type] };
    if (category) data.system = { category };
    if (category === "skillChip") data.name = "Chip de habilidad";
    const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
    item?.sheet.render({ force: true });
  }

  async _pickFromCompendium(event, target) {
    const { itemType, category, module } = target.dataset;
    const packs = game.packs.filter(pack => {
      if (pack.documentName !== "Item" || pack.metadata?.packageName !== "tdt" || !packEnabled(pack)) return false;
      return !module || packModule(pack) === module;
    });
    const entries = [];
    for (const pack of packs) {
      const index = await pack.getIndex({ fields: ["type", "img", "system.category", "system.endurance", "system.damage", "system.properties", "system.cost"] });
      for (const item of index) {
        if (itemType && item.type !== itemType) continue;
        if (category && item.system?.category !== category) continue;
        entries.push({
          pack,
          id: item._id,
          name: item.name,
          img: item.img,
          type: item.type,
          cost: Number(item.system?.cost || 0),
          module: packModule(pack),
          generic: pack.metadata?.name === "basic-generic-weapons",
          category: pickerCategory(item)
        });
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    if (!entries.length) return ui.notifications.warn("No hay objetos compatibles en los compendios activos.");
    const categoryTabs = categoriesForType(itemType);
    const availableModules = [...new Set(entries.map(entry => entry.module))];
    const moduleLabel = key => key ? (TDT.modules[key] ?? key).replace(/^Módulo (de )?/, "") : "Común";
    const spendable = itemType === "feat" && this.actor.type === "character";
    const available = Number(this.actor.system.experience?.value || 0);
    const costText = entry => (entry.type === "feat" ? ` · ${entry.cost >= 0 ? "+" : ""}${entry.cost} XP` : "");
    const categoryControls = categoryTabs.length ? `<nav class="tdt-picker-tabs" aria-label="Categoría">${categoryTabs.map((key, index) => `<button type="button" data-picker-category="${key}" class="${index === 0 ? "active" : ""}" aria-pressed="${index === 0}">${PICKER_CATEGORIES[key]}</button>`).join("")}</nav>` : "";
    const moduleControls = availableModules.length > 1 ? `<fieldset class="tdt-picker-modules"><legend>Repositorios</legend>${availableModules.map(key => `<label><input type="checkbox" data-picker-module="${key}" checked> ${esc(moduleLabel(key))}</label>`).join("")}</fieldset>` : "";
    const genericControl = itemType === "weapon" && entries.some(entry => entry.generic) ? `<label class="tdt-picker-switch"><input type="checkbox" name="includeGeneric"><span></span> Incluir armas generales</label>` : "";
    const spendControl = spendable ? `<label class="tdt-picker-switch tdt-picker-xp"><input type="checkbox" name="spendXp" checked><span></span> Gastar experiencia <small>(disponible: <strong>${available}</strong>; las desventajas la suman)</small></label>` : "";
    const content = `<div class="tdt-compendium-picker">
      <div class="tdt-list-toolbar"><i class="fas fa-magnifying-glass"></i><input type="search" name="filter" placeholder="Buscar por nombre o compendio…" autocomplete="off"></div>
      ${moduleControls}
      ${categoryControls}
      ${genericControl}
      ${spendControl}
      <select name="entry" size="14" aria-label="Objeto del compendio">${entries.map((entry, index) => `<option value="${index}" data-picker-category="${entry.category}" data-picker-module="${entry.module}" data-picker-generic="${entry.generic}" data-cost="${entry.cost}">${esc(entry.name)}${costText(entry)} · ${esc(entry.pack.title)}</option>`).join("")}</select>
      <p class="tdt-picker-empty" hidden>No hay resultados con estos filtros.</p>
      <p class="tdt-picker-xp-warning" hidden><i class="fas fa-triangle-exclamation"></i> <span></span></p>
      <p class="hint">Doble clic para añadir. El objeto se copia a la ficha y después se puede editar con normalidad.</p>
    </div>`;
    const picked = await tdtDialog({
      title: `Buscar ${TDT.itemTypes[itemType] ?? "objeto"} en compendios`,
      content,
      classes: ["tdt-compendium-dialog"],
      width: 700,
      buttons: [
        { action: "add", label: "Añadir a la ficha", icon: "fas fa-plus", default: true, callback: form => {
          const value = form.elements.entry.value;
          return value === "" ? null : { index: Number(value), spendXp: Boolean(form.elements.spendXp?.checked) };
        } },
        { action: "cancel", label: "Cancelar" }
      ],
      render: (form, dialog) => {
        const input = form.elements.filter;
        const select = form.elements.entry;
        const generic = form.elements.includeGeneric;
        const spend = form.elements.spendXp;
        const empty = form.querySelector(".tdt-picker-empty");
        const warning = form.querySelector(".tdt-picker-xp-warning");
        const addButton = dialog.element.querySelector('button[data-action="add"]');
        const categoryButtons = [...form.querySelectorAll("button[data-picker-category]")];
        const moduleInputs = [...form.querySelectorAll("input[data-picker-module]")];
        let activeCategory = "all";
        // Spending XP: a feat you cannot afford cannot be added (disadvantages always can: they give XP).
        const checkCost = () => {
          const option = select.options[select.selectedIndex];
          const cost = Number(option?.dataset.cost || 0);
          const blocked = Boolean(spend?.checked && option && !option.disabled && cost > available);
          warning.hidden = !blocked;
          if (blocked) warning.querySelector("span").textContent = `Cuesta ${cost} XP y solo tienes ${available}.`;
          if (addButton) addButton.disabled = !option || option.disabled || blocked;
        };
        const applyFilters = () => {
          const query = normalize(input.value);
          const modules = new Set(moduleInputs.filter(control => control.checked).map(control => control.dataset.pickerModule));
          let first = null;
          for (const option of select.options) {
            const visible = (!query || normalize(option.textContent).includes(query))
              && (activeCategory === "all" || option.dataset.pickerCategory === activeCategory)
              && (!moduleInputs.length || modules.has(option.dataset.pickerModule))
              && (option.dataset.pickerGeneric !== "true" || generic?.checked);
            option.hidden = !visible;
            option.disabled = !visible;
            if (!option.hidden && first === null) first = option;
          }
          if (first) first.selected = true;
          else select.selectedIndex = -1;
          empty.hidden = Boolean(first);
          checkCost();
        };
        input.addEventListener("input", applyFilters);
        generic?.addEventListener("change", applyFilters);
        spend?.addEventListener("change", checkCost);
        select.addEventListener("change", checkCost);
        for (const control of moduleInputs) control.addEventListener("change", applyFilters);
        for (const button of categoryButtons) button.addEventListener("click", () => {
          activeCategory = button.dataset.pickerCategory;
          for (const entry of categoryButtons) {
            const active = entry === button;
            entry.classList.toggle("active", active);
            entry.setAttribute("aria-pressed", String(active));
          }
          applyFilters();
        });
        select.addEventListener("dblclick", () => {
          if (addButton && !addButton.disabled) addButton.click();
        });
        // Enter in the search field picks the first result instead of closing the dialog with nothing.
        input.addEventListener("keydown", event => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (addButton && !addButton.disabled) addButton.click();
        });
        applyFilters();
        input.focus();
      }
    });
    if (!picked || !entries[picked.index]) return;
    const entry = entries[picked.index];
    const document = await entry.pack.getDocument(entry.id);
    if (spendable && picked.spendXp) {
      const created = await this.actor.buyFeat(document.toObject());
      if (created) ui.notifications.info(`${created.name} añadido a ${this.actor.name}.`);
      return;
    }
    const [created] = await this._createDroppedItems([document.toObject()]);
    if (created) ui.notifications.info(`${created.name} añadido a ${this.actor.name}.`);
  }

  async _deleteItem(event, target) {
    const item = this._itemFromTarget(target);
    if (!item) return;
    const ok = await confirmDialog("Eliminar", `<p>¿Eliminar ${esc(item.name)}?</p>`);
    if (ok) await this.actor.deleteEmbeddedDocuments("Item", [item.id]);
  }

  /** Items dropped on (or picked into) the sheet. */
  async _createDroppedItems(list) {
    const data = list.map(entry => {
      const copy = foundry.utils.deepClone(entry);
      delete copy._id;
      // A compendium implant is equipment to be installed, not an operation already completed.
      if (copy.type === "implant") foundry.utils.setProperty(copy, "system.installed", false);
      return copy;
    });
    return this.actor.createEmbeddedDocuments("Item", data);
  }

  async _onDropItem(event, item) {
    if (!this.actor.isOwner) return null;
    if (this.actor.uuid === item.parent?.uuid) {
      const result = await this._onSortItem(event, item);
      return result?.length ? item : null;
    }
    const [created] = await this._createDroppedItems([item.toObject()]);
    return created ?? null;
  }

  async _toggleItem(event, target) {
    const item = this._itemFromTarget(target);
    if (!item) return;
    if (item.type === "hack" || (item.type === "gear" && item.system.category === "skillChip")) return this.actor.toggleHackLoaded(item);
    if (item.type === "implant") return this.actor.installImplant(item);
    if (["feat", "power"].includes(item.type)) return item.update({ "system.active": !item.system.active });
    if (item.type === "armor" && !item.system.equipped) {
      const required = Number(item.system.powerRequired || 0);
      const power = Number(this.actor.system.attributes.power.value || this.actor.system.attributes.power.die || 0);
      if (required && power < required && !this.actor.tdtFlags.has("servomotors")) ui.notifications.warn(`${item.name} requiere Potencia d${required}. Se equipará, pero aplica la penalización que determine el DJ.`);
    }
    await item.update({ "system.equipped": !item.system.equipped });
  }

  async _useItem(event, target) {
    const item = this._itemFromTarget(target);
    if (!item) return;
    if (Number(item.system.uses?.max) > 0 && Number(item.system.uses.value) <= 0) return ui.notifications.warn(`${item.name} no tiene usos disponibles.`);
    if (item.type === "gear" && item.system.category === "consumable" && Number(item.system.quantity) <= 0) return ui.notifications.warn(`No queda ${item.name}.`);
    await this._postItemToChat(item);
    if (Number(item.system.uses?.max) > 0 && Number(item.system.uses.value) > 0) await item.update({ "system.uses.value": Number(item.system.uses.value) - 1 });
    if (item.type === "gear" && item.system.category === "consumable" && Number(item.system.quantity) > 0) {
      await item.update({ "system.quantity": Math.max(0, Number(item.system.quantity) - 1) });
      if (/^zombix/i.test(item.name)) await this.actor.takeZombieMedicine("zombix");
      if (/^antizombix/i.test(item.name)) await this.actor.takeZombieMedicine("antizombix");
    }
  }

  async _chatItem(event, target) {
    const item = this._itemFromTarget(target);
    if (item) await this._postItemToChat(item);
  }

  async _postItemToChat(item) {
    const description = esc(item.system.description || "Sin descripción").replaceAll("\n", "<br>");
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="tdt-chat-card"><header>${esc(item.name)}</header><div class="tdt-item-message">${description}</div></div>`
    });
  }

  async _addReputation() {
    const list = foundry.utils.deepClone(this.actor.system.cyber.reputation ?? []);
    list.push({ faction: "Facción", value: 0 });
    await this.actor.update({ "system.cyber.reputation": list });
  }

  async _deleteReputation(event, target) {
    const index = Number(target.dataset.index);
    const list = foundry.utils.deepClone(this.actor.system.cyber.reputation ?? []);
    list.splice(index, 1);
    await this.actor.update({ "system.cyber.reputation": list });
  }

  /** Reputation rows come from the form as an object keyed by index. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const reputation = data.system?.cyber?.reputation;
    if (reputation && !Array.isArray(reputation)) {
      data.system.cyber.reputation = Object.keys(reputation).sort((a, b) => a - b).map(key => ({ faction: reputation[key].faction, value: Math.max(-5, Math.min(5, Number(reputation[key].value) || 0)) }));
    }
    return data;
  }

  async _damageDialog() {
    const cyber = moduleActive("cyber");
    const result = await tdtDialog({
      title: "Aplicar daño",
      content: `<div class="form-group"><label>Daño</label><input type="number" name="damage" min="0" value="1" autofocus></div>
        <div class="form-group"><label>Ya descontado el aguante</label><input type="checkbox" name="raw"></div>
        <div class="form-group"><label>Ignorar aguante</label><input type="checkbox" name="ignore"></div>
        ${cyber ? `<div class="form-group"><label>Daño de hack (solo aguante natural)</label><input type="checkbox" name="hack"></div><div class="form-group"><label>Disparo (aguante contra disparos)</label><input type="checkbox" name="shot"></div>` : ""}`,
      buttons: [
        { action: "apply", label: "Aplicar", icon: "fas fa-heart-crack", default: true, callback: form => {
          const checked = name => form.elements[name]?.checked ?? false;
          return { amount: Number(form.elements.damage.value), raw: checked("raw"), ignoreEndurance: checked("ignore"), hack: checked("hack"), shot: checked("shot") };
        } },
        { action: "cancel", label: "Cancelar" }
      ]
    });
    if (!result) return;
    const { amount, ...options } = result;
    return this.actor.applyDamage(amount, options);
  }

  async _healDialog() {
    const healing = await tdtDialog({
      title: "Recuperar vida",
      content: `<div class="form-group"><label>Curación</label><input type="number" name="healing" min="0" value="1" autofocus></div>`,
      buttons: [
        { action: "apply", label: "Curar", icon: "fas fa-kit-medical", default: true, callback: form => Math.max(0, Number(form.elements.healing.value) || 0) },
        { action: "cancel", label: "Cancelar" }
      ]
    });
    if (healing === null) return;
    const max = this.actor.system.health.effectiveMax ?? this.actor.system.health.max;
    return this.actor.update({ "system.health.value": Math.min(max, Number(this.actor.system.health.value) + healing) });
  }
}

/* -------------------------------------------- */
/*  Mecha sheet                                  */
/* -------------------------------------------- */

export class TDTMechaSheet extends TDTActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["mecha"],
    position: { width: 820, height: 760 }
  };

  static PARTS = {
    sheet: { template: "systems/tdt/templates/mecha-sheet.hbs", scrollable: [".sheet-body .tab"] }
  };

  static ACTIONS = {
    ...TDTActorSheet.ACTIONS,
    "open-pilot": "_openPilot",
    "mecha-roll": "_mechaRoll",
    "module-step": "_moduleStep"
  };

  static EDIT_ACTIONS = new Set([...TDTActorSheet.EDIT_ACTIONS, "mecha-roll", "module-step"]);

  async _prepareContext(options) {
    const context = await ActorSheetV2.prototype._prepareContext.call(this, options);
    const actor = this.actor;
    const system = actor.system;
    context.actor = actor;
    context.system = system;
    context.config = sheetConfig();
    context.categories = Object.fromEntries(Object.keys(TDT.mechaCategories).map(key => [key, `Categoría ${key}`]));
    context.pilot = actor.pilotActor?.();
    context.copilot = actor.copilotActor?.();
    context.pilots = Object.fromEntries([["", "—"], ...game.actors.filter(other => other.type === "character").map(other => [other.uuid, other.name])]);
    context.modulesList = Object.entries(TDT.mechaModules).map(([key, label]) => {
      const die = Number(system.modules[key] || 4);
      return { key, label, die, nextCost: die < 12 ? dieScore(die + 2) + Number(system.category || 1) : null };
    });
    const decorate = item => {
      const props = parseWeaponProperties(item.system.properties);
      return {
        id: item.id,
        name: item.name,
        img: item.img,
        type: item.type,
        system: item.system,
        summary: itemSummary(item, actor),
        cost: Mecha.itemInventoryCost(item, system.category),
        reloadable: Number(item.system.ammo?.max) > 0,
        overloadable: item.type === "weapon" && !props.hand
      };
    };
    const sortedItems = [...actor.items].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.weapons = sortedItems.filter(item => item.type === "weapon").map(decorate);
    context.gear = sortedItems.filter(item => item.type === "gear" || item.type === "armor").map(decorate);
    context.feats = sortedItems.filter(item => item.type === "feat").map(decorate);
    context.mechaDamage = rule("mechaDamage");
    context.moduleLimit = Number(rule("mechaModuleLimit") || 12);
    context.healthPercent = clamp((Number(system.health.value) / Math.max(1, Number(system.health.max) || 1)) * 100, 0, 100);
    context.inventoryPercent = clamp((Number(system.inventory.spent) / Math.max(1, Number(system.inventory.max) || 1)) * 100, 0, 100);
    context.inventoryOver = Number(system.inventory.remaining) < 0;
    context.inventoryExcess = Math.max(0, -Number(system.inventory.remaining));
    context.itemCount = context.weapons.length + context.gear.length + context.feats.length;
    return context;
  }

  _openPilot(event, target) {
    fromUuidSync(target.dataset.uuid)?.sheet.render({ force: true });
  }

  _mechaRoll(event, target) {
    return this.actor.rollMechaStat(target.dataset.stat);
  }

  _moduleStep(event, target) {
    return this.actor.upgradeMechaModule(target.dataset.moduleKey, Number(target.dataset.moduleStep));
  }

  async _onDropActor(event, dropped) {
    if (!this.isEditable || !dropped || dropped.type !== "character") return null;
    const field = this.actor.system.pilot ? "system.copilot" : "system.pilot";
    return this.actor.update({ [field]: dropped.uuid });
  }

  _processFormData(event, form, formData) {
    return foundry.utils.expandObject(formData.object);
  }
}

/* -------------------------------------------- */
/*  Vehicle and stationary weapon sheet          */
/* -------------------------------------------- */

export class TDTVehicleSheet extends TDTActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["vehicle"],
    position: { width: 780, height: 720 }
  };

  static PARTS = {
    sheet: { template: "systems/tdt/templates/vehicle-sheet.hbs", scrollable: [".sheet-body .tab"] }
  };

  static ACTIONS = {
    ...TDTActorSheet.ACTIONS,
    "open-actor": "_openActor",
    "crew-remove": "_removeCrew",
    "crew-driver": "_makeDriver",
    "machine-maneuver": "_maneuver",
    "machine-ram": "_ram"
  };

  static EDIT_ACTIONS = new Set([...TDTActorSheet.EDIT_ACTIONS, "crew-remove", "crew-driver", "machine-maneuver", "machine-ram"]);

  async _prepareContext(options) {
    const context = await ActorSheetV2.prototype._prepareContext.call(this, options);
    const actor = this.actor;
    const system = actor.system;
    const isVehicle = actor.type === "vehicle";
    context.actor = actor;
    context.system = system;
    context.config = sheetConfig();
    context.isGM = game.user.isGM;
    context.isVehicle = isVehicle;
    context.actorTypeLabel = isVehicle ? "Vehículo" : "Arma estacionaria";
    context.driverLabel = isVehicle ? "Conductor" : "Operador";
    const { driver, crew } = actor.machineCrew();
    const person = other => ({ uuid: other.uuid, name: other.name, img: other.img, owner: other.isOwner });
    context.driver = driver ? person(driver) : null;
    context.crew = crew.map(person);
    context.crewCount = (driver ? 1 : 0) + crew.length;
    context.driverChoices = Object.fromEntries([["", "—"], ...game.actors.filter(other => ["character", "npc"].includes(other.type)).map(other => [other.uuid, other.name])]);
    context.drivingAttributes = { dexterity: TDT.attributes.dexterity, mind: TDT.attributes.mind };
    if (isVehicle && driver) {
      const feat = Vehicle.drivingFeat(driver, Vehicle.vehicleProfile(actor).category);
      context.driverTrained = feat.trained;
    }
    const decorate = item => ({
      id: item.id,
      name: item.name,
      img: item.img,
      type: item.type,
      system: item.system,
      summary: itemSummary(item, actor),
      reloadable: Number(item.system.ammo?.max) > 0
    });
    const sorted = [...actor.items].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    context.weapons = sorted.filter(item => item.type === "weapon").map(decorate);
    context.cargo = sorted.filter(item => item.type !== "weapon").map(decorate);
    const modifier = Number(system.modifier || 0);
    context.modifierText = modifier > 0 ? `bonifica ${modifier}` : modifier < 0 ? `penaliza ${-modifier}` : "";
    context.hasEvasion = system.evasion !== null && system.evasion !== undefined && system.evasion !== "";
    context.healthPercent = clamp((Number(system.health.value) / Math.max(1, Number(system.health.max) || 1)) * 100, 0, 100);
    context.destroyed = Number(system.health.value) <= 0;
    return context;
  }

  _openActor(event, target) {
    fromUuidSync(target.closest("[data-uuid]")?.dataset.uuid)?.sheet.render({ force: true });
  }

  _removeCrew(event, target) {
    return this.actor.removeMachineCrew(target.closest("[data-uuid]")?.dataset.uuid);
  }

  _makeDriver(event, target) {
    const uuid = target.closest("[data-uuid]")?.dataset.uuid;
    const previous = this.actor.system.driver;
    return this.actor.setMachineDriver(uuid).then(() => (previous && previous !== uuid ? this.actor.addMachineCrew(previous) : null));
  }

  _maneuver() {
    return this.actor.vehicleManeuver();
  }

  _ram() {
    return this.actor.vehicleRam();
  }

  /** Characters and NPCs dropped on the sheet join the crew (the first one drives). */
  async _onDropActor(event, dropped) {
    if (!this.isEditable || !dropped || !["character", "npc"].includes(dropped.type)) return null;
    return this.actor.addMachineCrew(dropped.uuid);
  }

  /** An empty fixed Esquiva means "the driver dodges" (null), not 0. */
  _processFormData(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if (data.system && "evasion" in data.system) {
      const raw = data.system.evasion;
      data.system.evasion = raw === "" || raw === null || raw === undefined || Number.isNaN(Number(raw)) ? null : Number(raw);
    }
    // Changing the driver from the select keeps the crew list without duplicates.
    if (data.system?.driver) data.system.crew = (this.actor.system.crew ?? []).filter(uuid => uuid !== data.system.driver);
    return data;
  }
}

/* -------------------------------------------- */
/*  Item sheet                                   */
/* -------------------------------------------- */

const JSON_FIELDS = ["system.modifiers", "system.rules", "system.upgrades", "system.marks", "system.shared", "system.tags", "system.upgrades.basic"];

export class TDTItemSheet extends TDTSheetMixin(ItemSheetV2) {
  static TABS = { primary: { initial: "details", tabs: [] } };

  static DEFAULT_OPTIONS = {
    classes: ["tdt", "sheet", "item"],
    position: { width: 600, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    sheet: { template: "systems/tdt/templates/item-sheet.hbs", scrollable: [".sheet-body .tab"] }
  };

  static ACTIONS = {
    "upgrade-add": "_addUpgrade",
    "upgrade-delete": "_deleteUpgrade",
    "mark-add": "_addMark",
    "mark-delete": "_deleteMark"
  };

  _onClickAction(event, target) {
    if (!this.isEditable) return;
    return super._onClickAction(event, target);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const system = item.system;
    context.item = item;
    context.system = system;
    context.config = sheetConfig();
    context.modules = modulesContext();
    context.typeLabel = TDT.itemTypes[item.type];
    context.is = Object.fromEntries(Object.keys(TDT.itemTypes).map(type => [type, item.type === type]));
    context.json = {
      modifiers: JSON.stringify(system.modifiers ?? [], null, 1),
      rules: JSON.stringify(system.rules ?? [], null, 1),
      upgrades: JSON.stringify(Array.isArray(system.upgrades) ? system.upgrades : [], null, 1),
      marks: JSON.stringify(system.marks ?? [], null, 1),
      shared: JSON.stringify(system.shared ?? [], null, 1)
    };
    context.tagsText = (system.tags ?? []).join(", ");
    context.showCondition = moduleActive("cyber") || moduleActive("zombie") || rule("weaponCondition");
    context.showBasicUpgrades = rule("weaponUpgrades");
    context.basicUpgrades = Object.entries(TDT.basicWeaponUpgrades).map(([key, label]) => ({ key, label, text: TDT.basicWeaponUpgradeText[key], checked: (system.upgrades?.basic ?? []).includes(key) }));
    if (item.type === "implant") {
      context.implantCost = Cyber.implantCost(item);
      context.isAVS = Cyber.isAVS(item);
      context.upgradeRows = (Array.isArray(system.upgrades) ? system.upgrades : []).map((upgrade, index) => ({ ...upgrade, index }));
    }
    if (item.type === "gear" && system.category === "vehicle") context.vehicle = Vehicle.vehicleProfile(item);
    if (item.type === "gear" && system.category === "skillChip") {
      const kind = chipKindOf(system);
      context.chip = { kind, kinds: CHIP_KINDS, targets: chipTargetsFor(kind), targetLabel: kind === "defense" ? "Defensa" : "Habilidad" };
    }
    if (item.type === "spell") {
      const owner = item.parent;
      const feats = owner ? Fantasy.knownCircleParts(owner).feats : new Set();
      context.circle = Fantasy.circleCost(system, { feats, hasFocus: owner ? owner.system.fantasy?.hasFocus : true });
      context.markRows = (system.marks ?? []).map((mark, index) => ({ ...mark, index, modifiersText: (mark.modifiers ?? []).join(", ") }));
      context.rootChoices = Object.fromEntries([["", "—"], ...Object.entries(TDT.circleRoots).map(([key, root]) => [key, `${root.label} (${root.cost})`])]);
      context.modifierHelp = Object.entries(TDT.circleModifiers).map(([key, mod]) => `${key} = ${mod.label} (${mod.polarity === "positive" ? "+" : mod.polarity === "negative" ? "−" : "neutro"})`).join(" · ");
    }
    if (item.type === "weapon") context.mechaWeapon = moduleActive("mecha") && (system.mecha?.enabled || item.parent?.type === "mecha");
    context.targetHelp = Object.entries(TDT.modifierTargets).map(([key, label]) => `${key}: ${label}`).join("\n");
    return context;
  }

  _addUpgrade() {
    return this._editArray("system.upgrades", list => list.push({ name: "Mejora", cc: 2, installed: false, description: "", modifiers: [], rules: [] }));
  }

  _deleteUpgrade(event, target) {
    return this._editArray("system.upgrades", list => list.splice(Number(target.dataset.index), 1));
  }

  _addMark() {
    return this._editArray("system.marks", list => list.push({ root: "fire", subtracted: false, modifiers: [], extraPotency: 0 }));
  }

  _deleteMark(event, target) {
    return this._editArray("system.marks", list => list.splice(Number(target.dataset.index), 1));
  }

  async _editArray(path, edit) {
    const list = foundry.utils.deepClone(foundry.utils.getProperty(this.item, path) ?? []);
    edit(list);
    await this.item.update({ [path]: list });
  }

  _processFormData(event, form, formData) {
    const data = foundry.utils.deepClone(formData.object);
    // Raw JSON editors.
    for (const key of Object.keys(data)) {
      if (!key.startsWith("json.")) continue;
      const path = key.slice(5);
      const text = String(data[key] ?? "").trim();
      delete data[key];
      try {
        const parsed = text ? JSON.parse(text) : [];
        const current = foundry.utils.getProperty(this.item, path) ?? [];
        // Unchanged JSON must not overwrite the row editors of the same field.
        if (JSON.stringify(parsed) === JSON.stringify(current)) continue;
        for (const other of Object.keys(data)) if (other.startsWith(`${path}.`)) delete data[other];
        data[path] = parsed;
      } catch (error) {
        ui.notifications.error(`JSON no válido en ${path}: ${error.message}`);
      }
    }
    if ("tagsText" in data) {
      data["system.tags"] = String(data.tagsText).split(",").map(tag => tag.trim()).filter(Boolean);
      delete data.tagsText;
    }
    // Basic weapon upgrades as checkboxes.
    if (Object.keys(data).some(key => key.startsWith("basicUpgrade."))) {
      const basic = Object.keys(data).filter(key => key.startsWith("basicUpgrade.") && data[key]).map(key => key.slice(13));
      for (const key of Object.keys(data)) if (key.startsWith("basicUpgrade.")) delete data[key];
      data["system.upgrades.basic"] = basic;
    }
    const expanded = foundry.utils.expandObject(data);
    // Row editors (implant upgrades, circle marks) come keyed by index.
    if (expanded.system?.upgrades && this.item.type === "implant") {
      expanded.system.upgrades = rowsFromForm(expanded.system.upgrades, this.item.system.upgrades, upgrade => ({ ...upgrade, cc: Number(upgrade.cc || 0), installed: Boolean(upgrade.installed) }));
    }
    if (expanded.system?.marks && this.item.type === "spell") {
      expanded.system.marks = rowsFromForm(expanded.system.marks, this.item.system.marks, mark => ({
        ...mark,
        subtracted: Boolean(mark.subtracted),
        extraPotency: Number(mark.extraPotency || 0),
        modifiers: typeof mark.modifiersText === "string" ? mark.modifiersText.split(",").map(text => text.trim()).filter(key => TDT.circleModifiers[key]) : (mark.modifiers ?? [])
      })).map(({ modifiersText, index, ...mark }) => mark);
    }
    return expanded;
  }
}

export const SHEET_JSON_FIELDS = JSON_FIELDS;
