import { TDTActor } from "./actor.mjs";
import { choiceDialog } from "./dialogs.mjs";
import { actorDataFromItem, drivingFeat, vehicleProfile } from "./modules/vehicle.mjs";

/**
 * Vehicles and stationary weapons (emplacements) as actors: a machine with health, endurance, crew and
 * mounted weapons. The crew rolls with their own dice: the driver drives (Conducir) and dodges with the
 * vehicle, and whoever mans a mounted weapon shoots it with Puntería.
 */
const methods = {
  /** The driver (vehicle) or operator (emplacement) and the rest of the crew, as actors. */
  machineCrew() {
    const resolve = uuid => (uuid ? fromUuidSync(uuid) : null);
    const driver = resolve(this.system.driver);
    const crew = (this.system.crew ?? []).map(resolve).filter(Boolean);
    return { driver, crew, all: [...new Set([driver, ...crew].filter(Boolean))] };
  },

  async setMachineDriver(uuid) {
    const crew = (this.system.crew ?? []).filter(entry => entry !== uuid);
    return this.update({ "system.driver": uuid || "", "system.crew": crew });
  },

  async addMachineCrew(uuid) {
    if (!uuid || uuid === this.uuid) return null;
    if (!this.system.driver) return this.setMachineDriver(uuid);
    if (this.system.driver === uuid || (this.system.crew ?? []).includes(uuid)) return null;
    return this.update({ "system.crew": [...(this.system.crew ?? []), uuid] });
  },

  async removeMachineCrew(uuid) {
    if (this.system.driver === uuid) return this.update({ "system.driver": "" });
    return this.update({ "system.crew": (this.system.crew ?? []).filter(entry => entry !== uuid) });
  },

  /** The driver must be someone the user controls (the GM controls everyone). */
  _machineDriver(action) {
    const { driver } = this.machineCrew();
    if (!driver) {
      ui.notifications.warn(`${this.name} no tiene ${this.type === "vehicle" ? "conductor" : "operador"}. Arrastra un personaje a la ficha.`);
      return null;
    }
    if (!driver.isOwner) {
      ui.notifications.warn(`Solo quien controla a ${driver.name} puede ${action}.`);
      return null;
    }
    return driver;
  },

  async vehicleManeuver(options = {}) {
    if (this.type !== "vehicle") return null;
    const driver = this._machineDriver("conducir");
    return driver?.driveVehicle(this.uuid, options) ?? null;
  },

  async vehicleRam(options = {}) {
    if (this.type !== "vehicle") return null;
    const driver = this._machineDriver("embestir");
    return driver?.ramVehicle(this.uuid, options) ?? null;
  },

  /** Fires a mounted weapon: one of the crew the user controls rolls it with their own dice. */
  async fireMountedWeapon(itemRef, options = {}) {
    const item = typeof itemRef === "string" ? this.items.get(itemRef) : itemRef;
    if (!item || item.type !== "weapon") return null;
    const gunners = this.machineCrew().all.filter(actor => actor.isOwner);
    if (!gunners.length) return ui.notifications.warn(`Nadie que controles maneja ${item.name}. Añade a la tripulación de ${this.name} un personaje o un PNJ.`);
    let gunner = options.gunner ? gunners.find(actor => actor.uuid === options.gunner) : gunners[0];
    if (!gunner) return ui.notifications.warn(`Ese tripulante no maneja ${item.name}.`);
    if (!options.gunner && gunners.length > 1) {
      const id = await choiceDialog(`Disparar: ${item.name}`, "¿Quién dispara?", gunners.map(actor => ({ id: actor.uuid, label: actor.name })));
      if (!id) return null;
      gunner = gunners.find(actor => actor.uuid === id);
    }
    const { gunner: _gunner, ...rest } = options;
    return gunner.rollWeapon(item, rest);
  },

  /** Attacked while moving: the driver dodges with the vehicle (Conducir and the vehicle's modifier). */
  async _vehicleDefense(rollOptions) {
    const driver = this._machineDriver("esquivar con el vehículo");
    if (!driver) return null;
    const profile = vehicleProfile(this);
    // Without the Conducir feat the autopilot (if any) dodges with its fixed value.
    if (!drivingFeat(driver, profile.category).trained) {
      if (profile.autopilot) return { total: profile.autopilot, difficultyMod: 0, isFumble: false };
      ui.notifications.warn(`${driver.name} necesita la dote Conducir (${profile.category}) para esquivar con ${this.name}.`);
      return null;
    }
    return driver.driveVehicle(this.uuid, { ...rollOptions, label: `${rollOptions.label}: ${driver.name} esquiva con ${this.name}`, scopes: ["evasion", ...(rollOptions.scopes ?? [])] });
  },

  /** Creates the vehicle actor of an inventory vehicle (gear item). */
  async vehicleSheetFromItem(itemId) {
    const item = this.items.get(itemId);
    if (!item || item.type !== "gear" || item.system.category !== "vehicle") return null;
    const data = actorDataFromItem(item);
    if (this.type === "character") data.system.driver = this.uuid;
    data.ownership = foundry.utils.deepClone(this.ownership);
    const actor = await Actor.create(data);
    if (!actor) return null;
    ui.notifications.info(`Ficha de vehículo creada: ${actor.name}.`);
    actor.sheet.render({ force: true });
    return actor;
  }
};

for (const [name, fn] of Object.entries(methods)) {
  Object.defineProperty(TDTActor.prototype, name, { value: fn, writable: true, configurable: true });
}
