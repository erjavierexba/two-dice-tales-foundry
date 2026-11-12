const numberAfter = (text, pattern, fallback = 0) => Number(String(text).match(pattern)?.[1] ?? fallback) || 0;

/** Actor types that are machines with crew: vehicles and stationary weapons. */
export const MACHINE_TYPES = new Set(["vehicle", "emplacement"]);

export function isMachineActor(actor) {
  return MACHINE_TYPES.has(actor?.type);
}

/** Normalized data of a vehicle actor. */
function actorProfile(actor) {
  const system = actor.system ?? {};
  const endurance = Number(system.endurance?.value || 0);
  return {
    category: String(system.category || "vehículo"),
    attribute: system.attribute || "dexterity",
    passengers: Number(system.passengers || 0),
    modifier: Number(system.modifier || 0),
    health: { value: Number(system.health?.value || 0), max: Number(system.health?.max || 0) },
    endurance,
    crashDamage: Number(system.crashDamage || 0) || endurance,
    autopilot: Number(system.autopilot || 0),
    analog: Boolean(system.analog),
    flying: Boolean(system.flying)
  };
}

/** Normalized vehicle data (a vehicle actor or a vehicle item), with a fallback for old entries that only stored prose. */
export function vehicleProfile(item) {
  if (item?.documentName === "Actor") return actorProfile(item);
  const system = item.system ?? {};
  const vehicle = system.vehicle ?? {};
  const text = String(system.description ?? "").replace(/\\-/g, "-");
  const driveText = text.match(/(?:Conducir|categor[ií]a)[^:]*:\s*([^)\.]+)/i)?.[1]?.trim() ?? "";
  let modifier = Number(vehicle.modifier || 0);
  if (!modifier) {
    const bonus = numberAfter(text, /(?:Conducci[oó]n|Modificador de conducci[oó]n):\s*Bonifica en\s*(\d+)/i);
    const penalty = numberAfter(text, /(?:Conducci[oó]n|Modificador de conducci[oó]n):\s*-(\d+)/i);
    modifier = bonus - penalty;
  }
  const structuredMaxHealth = Number(vehicle.health?.max || 0);
  const maxHealth = structuredMaxHealth || numberAfter(text, /(?:PV|Vida):\s*(\d+)/i);
  const endurance = Number(vehicle.endurance || numberAfter(text, /Aguante:\s*(\d+)/i));
  return {
    category: String(vehicle.category || driveText || "vehículo"),
    attribute: vehicle.attribute || "dexterity",
    passengers: Number(vehicle.passengers || numberAfter(text, /Pasajeros:\s*(\d+)/i)),
    modifier,
    health: { value: structuredMaxHealth ? Number(vehicle.health?.value ?? maxHealth) : maxHealth, max: maxHealth },
    endurance,
    crashDamage: Number(vehicle.crashDamage || numberAfter(text, /(?:estampar|ariete)[^\.]*Daño\s*(\d+)/i) || endurance),
    autopilot: Number(vehicle.autopilot || numberAfter(text, /Piloto autom[aá]tico[^\d]*(\d+)/i)),
    analog: Boolean(vehicle.analog || /Anal[oó]gico/i.test(text)),
    flying: Boolean(vehicle.flying || /(?:vuela|Este veh[ií]culo vuela)/i.test(text))
  };
}

export function drivingFeat(actor, category) {
  const normalized = String(category).toLocaleLowerCase("es");
  const feats = actor.items.filter(item => item.type === "feat");
  const matches = prefix => feats.some(item => {
    const name = item.name.toLocaleLowerCase("es");
    return name === prefix || (name.includes(prefix) && (normalized === "vehículo" || name.includes(normalized) || normalized.split("/").some(part => name.includes(part.trim()))));
  });
  // A loaded Conducir chip grants the feat for its category (empty category: any vehicle).
  const chip = actor.items.some(item => item.type === "gear" && item.system.category === "skillChip" && item.system.loaded && item.system.chipTarget === "driving" && chipCovers(item.system.chipVehicle, normalized));
  return { trained: matches("conducir") || chip, kansei: matches("kansei dorifto") };
}

function chipCovers(chipCategory, normalized) {
  const wanted = String(chipCategory ?? "").trim().toLocaleLowerCase("es");
  if (!wanted || normalized === "vehículo") return true;
  const parts = value => value.split("/").map(part => part.trim()).filter(Boolean);
  return parts(wanted).some(part => normalized.includes(part)) || parts(normalized).some(part => wanted.includes(part));
}

/**
 * Vehicle data stored by a vehicle item (gear), as the system of a vehicle actor.
 * Used to turn an inventory vehicle into its own sheet.
 */
export function actorDataFromItem(item) {
  const profile = vehicleProfile(item);
  return {
    name: item.name,
    type: "vehicle",
    img: "systems/tdt/assets/icons/vehicle.svg",
    system: {
      description: item.system.description ?? "",
      category: profile.category === "vehículo" ? "" : profile.category,
      attribute: profile.attribute,
      passengers: profile.passengers,
      modifier: profile.modifier,
      health: { value: profile.health.value || profile.health.max, max: profile.health.max },
      endurance: { value: profile.endurance },
      crashDamage: profile.crashDamage,
      autopilot: profile.autopilot,
      analog: profile.analog,
      flying: profile.flying,
      price: Number(item.system.price || 0)
    }
  };
}
