/**
 * Action hub: every roll an actor can make, grouped and one click away (in the "Acciones" tab of the sheet
 * and in a small window that follows the selected token). Shift+click rolls with the default options,
 * without the roll dialog.
 */
import { moduleActive, skillVisible } from "./settings.mjs";
import { parseWeaponProperties } from "./attack.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const DIE_STEPS = [4, 6, 8, 10, 12];

/** Methods the hub may call (the entries come back from the DOM). */
const HUB_METHODS = new Set([
  "rollWeapon", "rollSkill", "rollDefense", "rollPerception", "castHack", "usePower", "castCircle", "castSimpleSpell",
  "driveVehicle", "ramVehicle", "vehicleManeuver", "vehicleRam", "rollMechaStat", "rest", "newScene", "rollExcess",
  "rollDying", "fallDamage", "suppressiveFire"
]);

const entry = (actor, label, method, args = [], extra = {}) => ({ label, payload: JSON.stringify({ uuid: actor.uuid, method, args }), ...extra });

/** Highest number of attacks of a multiple attack: one per die step of the skill (d4 = 1 … d12 = 5). */
function maxAttacks(actor, item) {
  if (parseWeaponProperties(item.system.properties).singleAttack) return 1;
  const faces = Number(actor.system.skills?.[item.system.skill]?.value || 0);
  return Math.max(1, DIE_STEPS.indexOf(faces) + 1);
}

function weaponEntries(actor, items, { foreign = false } = {}) {
  return items.map(item => {
    const ref = foreign ? item.uuid : item.id;
    const count = actor.type === "character" ? maxAttacks(actor, item) : 1;
    const multi = Array.from({ length: count - 1 }, (_, index) => ({ label: `×${index + 2}`, payload: JSON.stringify({ uuid: actor.uuid, method: "rollWeapon", args: [ref, { attacks: index + 2 }] }) }));
    const hint = [`Daño ${item.system.damage}`];
    if (Number(item.system.ammo?.max)) hint.push(`${item.system.ammo.value}/${item.system.ammo.max}`);
    if (foreign) hint.push(item.parent?.name);
    if (actor.type === "npc" && item.system.attackDifficulty) hint.unshift(`Ataque ${item.system.attackDifficulty}`);
    return entry(actor, item.name, "rollWeapon", [ref], { img: item.img, hint: hint.filter(Boolean).join(" · "), multi });
  });
}

/** Groups of entries for an actor: [{ key, label, icon, entries: [{label, hint, img, payload, multi}] }]. */
export function actionGroups(actor) {
  if (!actor) return [];
  const groups = [];
  const add = (key, label, icon, entries) => entries.length && groups.push({ key, label, icon, entries });
  const items = type => actor.items.filter(item => item.type === type).sort((a, b) => (a.sort || 0) - (b.sort || 0));

  if (actor.type === "mecha") {
    add("attacks", "Ataques", "fa-crosshairs", weaponEntries(actor, items("weapon").filter(item => !item.system.mecha?.destroyed)));
    add("mecha", "Mecha", "fa-robot", [
      entry(actor, "Robustez", "rollMechaStat", ["robustness"]),
      entry(actor, "Maniobra táctica", "rollMechaStat", ["maneuver"]),
      entry(actor, "Percepción", "rollMechaStat", ["perception"])
    ]);
    return groups;
  }
  if (["vehicle", "emplacement"].includes(actor.type)) {
    if (actor.type === "vehicle") add("vehicle", "Conducción", "fa-car-side", [entry(actor, "Maniobra", "vehicleManeuver"), entry(actor, "Embestir", "vehicleRam")]);
    add("attacks", "Armas montadas", "fa-crosshairs", items("weapon").map(item => entry(actor, item.name, "rollWeapon", [item.id], { img: item.img, hint: `Daño ${item.system.damage}` })));
    return groups;
  }

  const weapons = items("weapon");
  const equipped = weapons.filter(item => item.system.equipped);
  add("attacks", "Ataques", "fa-crosshairs", weaponEntries(actor, equipped.length ? equipped : weapons));

  if (actor.type === "character") {
    const system = actor.system;
    const defenses = Object.entries(system.defenses ?? {}).map(([key, defense]) => entry(actor, defense.label, "rollDefense", [key], { hint: `d${defense.value ?? defense.die}` }));
    defenses.push(entry(actor, "Percepción", "rollPerception", [], { hint: `2d${system.perception?.faces ?? 4}` }));
    add("defenses", "Defensas", "fa-shield-halved", defenses);
    const skills = Object.entries(system.skills ?? {})
      .filter(([key, skill]) => skillVisible(key) && Number(skill.value ?? skill.die) > 0)
      .sort(([, a], [, b]) => Number(b.value ?? b.die) - Number(a.value ?? a.die) || String(a.label).localeCompare(String(b.label), "es"))
      .map(([key, skill]) => entry(actor, skill.label, "rollSkill", [key], { hint: `${system.attributes[skill.attribute]?.label ?? ""} + d${skill.value ?? skill.die}` }));
    add("skills", "Habilidades entrenadas", "fa-dice-d20", skills);
  }

  if (moduleActive("cyber")) add("hacks", "Hacks cargados", "fa-terminal", items("hack").filter(item => item.system.loaded).map(item => entry(actor, item.name, "castHack", [item.id], { img: item.img })));
  if (moduleActive("powers")) add("powers", "Poderes", "fa-bolt", items("power").filter(item => !item.system.permanent).map(item => entry(actor, item.name, "usePower", [item.id], { img: item.img })));
  if (moduleActive("fantasy")) {
    const simple = items("feat").filter(item => Number(item.system.incremental) || item.system.attack?.enabled || Number(item.system.sacrifice));
    add("magic", "Magia", "fa-wand-sparkles", [
      ...simple.map(item => entry(actor, item.name, "castSimpleSpell", [item.id], { img: item.img })),
      ...items("spell").map(item => entry(actor, item.name, "castCircle", [item.id], { img: item.img }))
    ]);
  }

  if (actor.type === "character") {
    const vehicles = items("gear").filter(item => item.system.category === "vehicle").flatMap(item => [
      entry(actor, `Conducir: ${item.name}`, "driveVehicle", [item.id], { img: item.img }),
      entry(actor, `Embestir: ${item.name}`, "ramVehicle", [item.id], { img: item.img })
    ]);
    // Vehicles and stationary weapons where this character is crew.
    const machines = game.actors.filter(other => ["vehicle", "emplacement"].includes(other.type) && (other.system.driver === actor.uuid || (other.system.crew ?? []).includes(actor.uuid)));
    for (const machine of machines) {
      if (machine.type === "vehicle" && machine.system.driver === actor.uuid) {
        vehicles.push(entry(actor, `Conducir: ${machine.name}`, "driveVehicle", [machine.uuid], { img: machine.img }));
        vehicles.push(entry(actor, `Embestir: ${machine.name}`, "ramVehicle", [machine.uuid], { img: machine.img }));
      }
      vehicles.push(...weaponEntries(actor, machine.items.filter(item => item.type === "weapon"), { foreign: true }));
    }
    add("vehicles", "Vehículos", "fa-car-side", vehicles);

    const resources = [];
    if (actor.system.dying?.active) resources.push(entry(actor, "Tirada de caído", "rollDying", [], { danger: true }));
    if (moduleActive("cyber") && Number(actor.system.cyberStats?.excess) > 0) resources.push(entry(actor, "Exceso de carga", "rollExcess", [], { danger: true }));
    resources.push(entry(actor, "Descansar", "rest"), entry(actor, "Daño por caída", "fallDamage"));
    add("resources", "Otros", "fa-bed", resources);
  }
  return groups;
}

/** Runs a hub entry. Shift (fast) skips the roll dialog and uses the default options. */
export async function runHubEntry(payload, { fast = false } = {}) {
  let data;
  try {
    data = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    return null;
  }
  if (!data || !HUB_METHODS.has(data.method)) return null;
  const actor = fromUuidSync(data.uuid);
  if (!actor?.isOwner || typeof actor[data.method] !== "function") return ui.notifications.warn("No controlas a ese personaje.");
  const args = Array.isArray(data.args) ? data.args : [];
  const run = () => actor[data.method](...args);
  return fast ? actor.quickRoll(run) : run();
}

/* -------------------------------------------- */
/*  Standalone window                            */
/* -------------------------------------------- */

/** The actor of the selected token, or the user's character. */
function hubActor() {
  const token = canvas?.tokens?.controlled?.[0];
  return token?.actor ?? game.user.character ?? null;
}

export class TDTActionHub extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tdt-action-hub",
    classes: ["tdt", "tdt-action-hub-window"],
    position: { width: 320, height: 560, top: 80, left: 120 },
    window: { title: "Acciones", icon: "fas fa-dice", resizable: true },
    actions: {
      "hub-run": function (event, target) {
        return runHubEntry(target.dataset.payload, { fast: event.shiftKey });
      },
      "hub-sheet": function () {
        return this.actor?.sheet.render({ force: true });
      }
    }
  };

  static PARTS = {
    hub: { template: "systems/tdt/templates/action-hub.hbs", scrollable: [".tdt-hub-body"] }
  };

  /** A single shared instance. */
  static toggle() {
    const existing = foundry.applications.instances.get("tdt-action-hub");
    if (existing) return existing.close();
    return new TDTActionHub().render({ force: true });
  }

  get actor() {
    return this._actor ?? hubActor();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this._actor = hubActor();
    const actor = this._actor;
    context.actor = actor;
    context.groups = actor?.isOwner ? actionGroups(actor) : [];
    context.standalone = true;
    return context;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const refresh = () => this.rendered && this.render();
    const related = document => document === this.actor || document?.parent === this.actor;
    this._hooks = [
      ["controlToken", Hooks.on("controlToken", () => setTimeout(refresh, 0))],
      ["updateActor", Hooks.on("updateActor", actor => related(actor) && refresh())],
      ["createItem", Hooks.on("createItem", item => related(item) && refresh())],
      ["updateItem", Hooks.on("updateItem", item => related(item) && refresh())],
      ["deleteItem", Hooks.on("deleteItem", item => related(item) && refresh())]
    ];
  }

  _onClose(options) {
    super._onClose?.(options);
    for (const [hook, id] of this._hooks ?? []) Hooks.off(hook, id);
    this._hooks = [];
  }
}
