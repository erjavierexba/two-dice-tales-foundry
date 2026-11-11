const normalize = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");

export const PICKER_CATEGORIES = {
  all: "Todas",
  light: "Ligeras",
  medium: "Medianas",
  heavy: "Pesadas",
  consumable: "Consumibles",
  equipment: "Equipo",
  vehicle: "Vehículos",
  chip: "Chips",
  other: "Otro"
};

/** Categorías de navegación del selector; no alteran las reglas del objeto. */
export function pickerCategory(item) {
  const system = item.system ?? {};
  if (item.type === "armor") {
    const endurance = Number(system.endurance || 0);
    if (endurance === 1) return "light";
    if (endurance === 2) return "medium";
    if (endurance >= 3) return "heavy";
    return "other";
  }
  if (item.type === "gear") {
    if (system.category === "consumable") return "consumable";
    if (system.category === "vehicle") return "vehicle";
    if (system.category === "skillChip") return "chip";
    if (["misc", "terminal"].includes(system.category)) return "equipment";
    return "other";
  }
  if (item.type === "weapon") {
    const name = normalize(item.name);
    if (/\bliger[ao]s?\b/.test(name)) return "light";
    if (/\bmedian[ao]s?\b/.test(name)) return "medium";
    if (/\bpesad[ao]s?\b/.test(name)) return "heavy";
    const properties = normalize(system.properties);
    if (/potencia\s+1?d(?:6|8|10|12)|tamano\s+[3-9]/.test(properties)) return "heavy";
    const damage = Number(system.damage || properties.match(/dano\s*(\d+)/)?.[1] || 0);
    if (!damage) return "other";
    if (damage <= 3) return "light";
    if (damage <= 6) return "medium";
    return "heavy";
  }
  return "other";
}

export function categoriesForType(type) {
  if (["weapon", "armor"].includes(type)) return ["all", "light", "medium", "heavy", "other"];
  if (type === "gear") return ["all", "consumable", "equipment", "vehicle", "chip", "other"];
  return [];
}
