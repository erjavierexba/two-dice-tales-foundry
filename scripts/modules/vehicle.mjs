const numberAfter = (text, pattern, fallback = 0) => Number(String(text).match(pattern)?.[1] ?? fallback) || 0;

/** Normalized vehicle data, with a fallback for old compendium entries that only stored prose. */
export function vehicleProfile(item) {
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
