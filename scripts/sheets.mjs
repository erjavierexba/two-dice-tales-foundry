import { TDT } from "./config.mjs";
import { currencySettings, moduleActive, rule, skillVisible } from "./settings.mjs";
import { packEnabled, packModule } from "./content.mjs";
import { dieScore } from "./dice.mjs";
import * as Fantasy from "./modules/fantasy.mjs";
import * as Cyber from "./modules/cyber.mjs";
import * as Mecha from "./modules/mecha.mjs";
import * as Vehicle from "./modules/vehicle.mjs";
import { parseWeaponProperties } from "./attack.mjs";

const ActorSheetBase = foundry.appv1.sheets.ActorSheet;
const ItemSheetBase = foundry.appv1.sheets.ItemSheet;
const esc = value => foundry.utils.escapeHTML(String(value ?? ""));
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const ITEM_IMAGES = {
  feat: "icons/svg/upgrade.svg",
  weapon: "icons/svg/sword.svg",
  armor: "icons/svg/shield.svg",
  gear: "icons/svg/item-bag.svg",
  race: "icons/svg/mystery-man.svg",
  spell: "icons/svg/explosion.svg",
  power: "icons/svg/lightning.svg",
  implant: "icons/svg/clockwork.svg",
  hack: "icons/svg/daze.svg"
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
    chipTargets: { "": "—", ...Object.fromEntries(Object.entries(TDT.skills).filter(([key]) => skillVisible(key))), driving: "Conducir (dote)", evasion: "Esquiva", fortitude: "Fortaleza", will: "Voluntad" }
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
    case "armor":
      return `Aguante +${system.endurance}${Number(system.damage) ? ` (−${system.damage})` : ""}${system.shotEndurance ? ` · ${system.shotEndurance} disparos` : ""}`;
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
/*  Character and NPC sheet                      */
/* -------------------------------------------- */

export class TDTActorSheet extends ActorSheetBase {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["tdt", "sheet", "actor"],
      width: 860,
      height: 780,
      resizable: true,
      submitOnChange: true,
      closeOnSubmit: false,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
    });
  }

  get template() {
    return "systems/tdt/templates/actor-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const actor = this.actor;
    const system = actor.system;
    context.system = system;
    context.config = sheetConfig();
    context.modules = modulesContext();
    context.currency = currencySettings();
    context.isNPC = actor.type === "npc";
    context.actorTypeLabel = context.isNPC ? "PNJ" : "Personaje";
    const hasActiveModules = Object.values(context.modules).some(Boolean);
    const hasSceneUses = actor.items.some(item => Number(item.system.uses?.max) > 0 && ["scene", "combat"].includes(item.system.uses.per));
    context.quickActions = {
      rest: !context.isNPC,
      newScene: context.modules.cyber || (hasActiveModules && hasSceneUses),
      fallDamage: !context.isNPC
    };
    context.quickActions.visible = Object.values(context.quickActions).some(Boolean);
    context.skills = Object.entries(system.skills)
      .filter(([key]) => skillVisible(key))
      .map(([key, skill]) => ({ key, ...skill, stepped: Number(skill.value) !== Number(skill.die) }));
    context.attributes = Object.entries(system.attributes).map(([key, attribute]) => ({ key, ...attribute, stepped: Number(attribute.value) !== Number(attribute.die) }));
    context.defenses = Object.entries(system.defenses).map(([key, defense]) => ({ key, ...defense, stepped: Number(defense.value) !== Number(defense.die) }));
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
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("button[title]:not([aria-label])").each((_, button) => button.setAttribute("aria-label", button.title));
    html.find("[data-filter-list]").on("input", event => this._filterList(event));
    html.find("[data-action='filter-clear']").on("click", event => this._clearFilter(event));
    html.find("[data-action='section-toggle']").on("click", event => {
      const section = event.currentTarget.closest(".tdt-section");
      section?.classList.toggle("collapsed");
      event.currentTarget.setAttribute("aria-expanded", String(!section?.classList.contains("collapsed")));
    });
    html.find("a[data-action]").on("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.currentTarget.click();
    });
    html.find("[data-action='item-edit']").on("click", event => this._itemFromEvent(event)?.sheet.render(true));
    html.find("[data-action='item-chat']").on("click", event => this._chatItem(event));
    // Item artwork is an affordance, not decoration: a single click opens the item.
    // Dragging still works because Foundry binds dragstart independently.
    html.find(".tdt-item-list .item img").on("click", event => this._itemFromEvent(event)?.sheet.render(true));
    html.find("[data-action='activate-tab']").on("click", event => {
      event.preventDefault();
      this.activateTab(event.currentTarget.dataset.tab, { group: "primary" });
    });
    if (!this.isEditable) return;
    html.find("[data-roll-skill]").on("click", event => this.actor.rollSkill(event.currentTarget.dataset.rollSkill));
    html.find("[data-roll-defense]").on("click", event => this.actor.rollDefense(event.currentTarget.dataset.rollDefense));
    html.find("[data-roll-perception]").on("click", () => this.actor.rollPerception());
    html.find("[data-action='damage']").on("click", () => this._damageDialog());
    html.find("[data-action='heal']").on("click", () => this._healDialog());
    html.find("[data-action='item-create']").on("click", event => this._createItem(event));
    html.find("[data-action='compendium-pick']").on("click", event => this._pickFromCompendium(event));
    html.find("[data-action='item-delete']").on("click", event => this._deleteItem(event));
    html.find("[data-action='item-toggle']").on("click", event => this._toggleItem(event));
    html.find("[data-action='item-use']").on("click", event => this._useItem(event));
    html.find("[data-action='weapon-roll']").on("click", event => {
      const item = this._itemFromEvent(event);
      if (item) this.actor.rollWeapon(item);
    });
    html.find("[data-actor-method]").on("click", event => this._callActorMethod(event));
    html.find("[data-action='reputation-add']").on("click", () => this._addReputation());
    html.find("[data-action='reputation-delete']").on("click", event => this._deleteReputation(event));
  }

  _filterList(event) {
    const input = event.currentTarget;
    const scope = input.closest(".tab") ?? input.closest("form");
    const query = String(input.value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("es");
    let visible = 0;
    for (const row of scope?.querySelectorAll(".tdt-item-list li[data-item-id], .tdt-skill-row") ?? []) {
      const text = row.textContent.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
      const hidden = Boolean(query) && !text.includes(query);
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

  _clearFilter(event) {
    const toolbar = event.currentTarget.closest(".tdt-list-toolbar");
    const input = toolbar?.querySelector("[data-filter-list]");
    if (!input) return;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  async _callActorMethod(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const method = element.dataset.actorMethod;
    if (typeof this.actor[method] !== "function") return;
    const itemId = element.closest("[data-item-id]")?.dataset.itemId;
    const arg = element.dataset.arg;
    if (itemId) return this.actor[method](itemId, ...(arg !== undefined ? [arg] : []));
    return arg !== undefined ? this.actor[method](arg) : this.actor[method]();
  }

  _itemFromEvent(event) {
    const id = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
    return this.actor.items.get(id);
  }

  async _createItem(event) {
    const { itemType: type, category } = event.currentTarget.dataset;
    const name = TDT.itemTypes[type] ?? "Objeto";
    const data = { name: `${name} nuevo`, type, img: ITEM_IMAGES[type] };
    if (category) data.system = { category };
    if (category === "skillChip") data.name = "Chip de habilidad";
    const [item] = await this.actor.createEmbeddedDocuments("Item", [data]);
    item.sheet.render(true);
  }

  async _pickFromCompendium(event) {
    const { itemType, category, module } = event.currentTarget.dataset;
    const packs = game.packs.filter(pack => {
      if (pack.documentName !== "Item" || pack.metadata?.packageName !== "tdt" || !packEnabled(pack)) return false;
      return !module || packModule(pack) === module;
    });
    const entries = [];
    for (const pack of packs) {
      const index = await pack.getIndex({ fields: ["type", "img", "system.category"] });
      for (const item of index) {
        if (itemType && item.type !== itemType) continue;
        if (category && item.system?.category !== category) continue;
        entries.push({ pack, id: item._id, name: item.name, img: item.img, type: item.type });
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    if (!entries.length) return ui.notifications.warn("No hay objetos compatibles en los compendios activos.");
    const content = `<form class="tdt-compendium-picker">
      <div class="tdt-list-toolbar"><i class="fas fa-magnifying-glass"></i><input type="search" name="filter" placeholder="Buscar por nombre o compendio…" autocomplete="off"></div>
      <select name="entry" size="14" aria-label="Objeto del compendio">${entries.map((entry, index) => `<option value="${index}">${esc(entry.name)} · ${esc(entry.pack.title)}</option>`).join("")}</select>
      <p class="hint">Doble clic para añadir. El objeto se copia a la ficha y después se puede editar con normalidad.</p>
    </form>`;
    const selected = await new Promise(resolve => {
      new Dialog({
        title: `Buscar ${TDT.itemTypes[itemType] ?? "objeto"} en compendios`,
        content,
        buttons: {
          add: { icon: '<i class="fas fa-plus"></i>', label: "Añadir a la ficha", callback: html => resolve(Number(html[0].querySelector('[name="entry"]').value)) },
          cancel: { label: "Cancelar", callback: () => resolve(null) }
        },
        default: "add",
        render: html => {
          const root = html[0];
          const input = root.querySelector('[name="filter"]');
          const select = root.querySelector('[name="entry"]');
          input.addEventListener("input", () => {
            const query = input.value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLocaleLowerCase("es");
            let first = null;
            for (const option of select.options) {
              const text = option.textContent.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
              option.hidden = Boolean(query) && !text.includes(query);
              if (!option.hidden && first === null) first = option;
            }
            if (first) first.selected = true;
          });
          select.addEventListener("dblclick", () => html.closest(".dialog").find(".dialog-button.add").trigger("click"));
          input.focus();
        },
        close: () => resolve(null)
      }, { classes: ["tdt", "tdt-dialog", "tdt-compendium-dialog"], width: 560 }).render(true);
    });
    if (selected === null || !entries[selected]) return;
    const entry = entries[selected];
    const document = await entry.pack.getDocument(entry.id);
    const [created] = await this._onDropItemCreate(document.toObject(), event);
    ui.notifications.info(`${created?.name ?? entry.name} añadido a ${this.actor.name}.`);
  }

  async _deleteItem(event) {
    const item = this._itemFromEvent(event);
    if (!item) return;
    const ok = await Dialog.confirm({ title: "Eliminar", content: `<p>¿Eliminar ${esc(item.name)}?</p>` });
    if (ok) await this.actor.deleteEmbeddedDocuments("Item", [item.id]);
  }

  async _onDropItemCreate(itemData, event) {
    const dropped = (Array.isArray(itemData) ? itemData : [itemData]).map(data => {
      const copy = foundry.utils.deepClone(data);
      // A compendium implant is equipment to be installed, not an operation already completed.
      if (copy.type === "implant") foundry.utils.setProperty(copy, "system.installed", false);
      return copy;
    });
    return super._onDropItemCreate(dropped, event);
  }

  async _toggleItem(event) {
    const item = this._itemFromEvent(event);
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

  async _useItem(event) {
    const item = this._itemFromEvent(event);
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

  async _chatItem(event) {
    const item = this._itemFromEvent(event);
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

  async _deleteReputation(event) {
    const index = Number(event.currentTarget.dataset.index);
    const list = foundry.utils.deepClone(this.actor.system.cyber.reputation ?? []);
    list.splice(index, 1);
    await this.actor.update({ "system.cyber.reputation": list });
  }

  /** Reputation rows come from the form as an object keyed by index. */
  async _updateObject(event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    const reputation = expanded.system?.cyber?.reputation;
    if (reputation && !Array.isArray(reputation)) {
      expanded.system.cyber.reputation = Object.keys(reputation).sort((a, b) => a - b).map(key => ({ faction: reputation[key].faction, value: Math.max(-5, Math.min(5, Number(reputation[key].value) || 0)) }));
    }
    return this.actor.update(expanded);
  }

  _damageDialog() {
    new Dialog({
      title: "Aplicar daño",
      content: `<form>
        <div class="form-group"><label>Daño</label><input type="number" name="damage" min="0" value="1"></div>
        <div class="form-group"><label>Ya descontado el aguante</label><input type="checkbox" name="raw"></div>
        <div class="form-group"><label>Ignorar aguante</label><input type="checkbox" name="ignore"></div>
        ${moduleActive("cyber") ? `<div class="form-group"><label>Daño de hack (solo aguante natural)</label><input type="checkbox" name="hack"></div><div class="form-group"><label>Disparo (aguante contra disparos)</label><input type="checkbox" name="shot"></div>` : ""}
      </form>`,
      buttons: {
        apply: {
          label: "Aplicar",
          callback: html => {
            const root = html[0];
            const value = name => root.querySelector(`[name="${name}"]`)?.checked ?? false;
            this.actor.applyDamage(Number(root.querySelector('[name="damage"]').value), { raw: value("raw"), ignoreEndurance: value("ignore"), hack: value("hack"), shot: value("shot") });
          }
        },
        cancel: { label: "Cancelar" }
      },
      default: "apply"
    }, { classes: ["tdt", "tdt-dialog"] }).render(true);
  }

  _healDialog() {
    new Dialog({
      title: "Recuperar vida",
      content: `<form><div class="form-group"><label>Curación</label><input type="number" name="healing" min="0" value="1"></div></form>`,
      buttons: {
        apply: {
          label: "Curar",
          callback: html => {
            const healing = Math.max(0, Number(html[0].querySelector('[name="healing"]').value) || 0);
            const max = this.actor.system.health.effectiveMax ?? this.actor.system.health.max;
            this.actor.update({ "system.health.value": Math.min(max, Number(this.actor.system.health.value) + healing) });
          }
        },
        cancel: { label: "Cancelar" }
      },
      default: "apply"
    }, { classes: ["tdt", "tdt-dialog"] }).render(true);
  }
}

/* -------------------------------------------- */
/*  Mecha sheet                                  */
/* -------------------------------------------- */

export class TDTMechaSheet extends TDTActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["tdt", "sheet", "actor", "mecha"],
      width: 820,
      height: 760,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main", group: "primary" }]
    });
  }

  get template() {
    return "systems/tdt/templates/mecha-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await ActorSheetBase.prototype.getData.call(this, options);
    const actor = this.actor;
    const system = actor.system;
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

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='open-pilot']").on("click", event => fromUuidSync(event.currentTarget.dataset.uuid)?.sheet.render(true));
    if (!this.isEditable) return;
    html.find("[data-mecha-roll]").on("click", event => this.actor.rollMechaStat(event.currentTarget.dataset.mechaRoll));
    html.find("[data-module-step]").on("click", event => {
      const { moduleKey, moduleStep } = event.currentTarget.dataset;
      this.actor.upgradeMechaModule(moduleKey, Number(moduleStep));
    });
  }

  async _onDropActor(event, data) {
    const dropped = await fromUuid(data.uuid);
    if (!dropped || dropped.type !== "character") return false;
    const field = this.actor.system.pilot ? "system.copilot" : "system.pilot";
    return this.actor.update({ [field]: dropped.uuid });
  }

  async _updateObject(event, formData) {
    return this.actor.update(foundry.utils.expandObject(formData));
  }
}

/* -------------------------------------------- */
/*  Item sheet                                   */
/* -------------------------------------------- */

const JSON_FIELDS = ["system.modifiers", "system.rules", "system.upgrades", "system.marks", "system.shared", "system.tags", "system.upgrades.basic"];

export class TDTItemSheet extends ItemSheetBase {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["tdt", "sheet", "item"],
      width: 600,
      height: 640,
      resizable: true,
      submitOnChange: true,
      closeOnSubmit: false,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }]
    });
  }

  get template() {
    return "systems/tdt/templates/item-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const item = this.item;
    const system = item.system;
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

  activateListeners(html) {
    super.activateListeners(html);
    html.find("button[title]:not([aria-label])").each((_, button) => button.setAttribute("aria-label", button.title));
    if (!this.isEditable) return;
    html.find("[data-action='upgrade-add']").on("click", () => this._editArray("system.upgrades", list => list.push({ name: "Mejora", cc: 2, installed: false, description: "", modifiers: [], rules: [] })));
    html.find("[data-action='upgrade-delete']").on("click", event => this._editArray("system.upgrades", list => list.splice(Number(event.currentTarget.dataset.index), 1)));
    html.find("[data-action='mark-add']").on("click", () => this._editArray("system.marks", list => list.push({ root: "fire", subtracted: false, modifiers: [], extraPotency: 0 })));
    html.find("[data-action='mark-delete']").on("click", event => this._editArray("system.marks", list => list.splice(Number(event.currentTarget.dataset.index), 1)));
  }

  async _editArray(path, edit) {
    const list = foundry.utils.deepClone(foundry.utils.getProperty(this.item, path) ?? []);
    edit(list);
    await this.item.update({ [path]: list });
  }

  async _updateObject(event, formData) {
    const data = foundry.utils.deepClone(formData);
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
    const basic = Object.keys(data).filter(key => key.startsWith("basicUpgrade.")).filter(key => data[key]).map(key => key.slice(13));
    if (Object.keys(data).some(key => key.startsWith("basicUpgrade."))) {
      for (const key of Object.keys(data)) if (key.startsWith("basicUpgrade.")) delete data[key];
      data["system.upgrades.basic"] = basic;
    }
    const expanded = foundry.utils.expandObject(data);
    // Row editors (implant upgrades, circle marks) come keyed by index.
    const rows = (value, current, map) => {
      if (!value || Array.isArray(value)) return value;
      return Object.keys(value).sort((a, b) => a - b).map(index => map({ ...(current?.[index] ?? {}), ...value[index] }));
    };
    if (expanded.system?.upgrades && this.item.type === "implant") {
      expanded.system.upgrades = rows(expanded.system.upgrades, this.item.system.upgrades, upgrade => ({ ...upgrade, cc: Number(upgrade.cc || 0), installed: Boolean(upgrade.installed) }));
    }
    if (expanded.system?.marks && this.item.type === "spell") {
      expanded.system.marks = rows(expanded.system.marks, this.item.system.marks, mark => ({
        ...mark,
        subtracted: Boolean(mark.subtracted),
        extraPotency: Number(mark.extraPotency || 0),
        modifiers: typeof mark.modifiersText === "string" ? mark.modifiersText.split(",").map(text => text.trim()).filter(key => TDT.circleModifiers[key]) : (mark.modifiers ?? [])
      })).map(({ modifiersText, index, ...mark }) => mark);
    }
    return this.item.update(expanded);
  }
}

export const SHEET_JSON_FIELDS = JSON_FIELDS;
