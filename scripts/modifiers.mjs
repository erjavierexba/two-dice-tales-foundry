import { evaluateFormula } from "./dice.mjs";

/**
 * Feats created before modifiers existed (or copied from old worlds) still work by name.
 */
const LEGACY_FEAT_MODIFIERS = {
  "mastodonte": [{ target: "endurance", value: 1 }, { target: "evasionPenalty", value: 1 }],
  "guerrero": [{ target: "endurance", value: 1 }, { target: "flag.warrior", value: 1 }],
  "retaco": [{ target: "endurance", value: -1 }, { target: "step.defense.evasion", value: 1 }],
  "mr burns": [{ target: "health", value: -4 }],
  "primo de zumosol": [{ target: "health", value: "zumosol" }],
  "me llaman “el pupas”": [{ target: "flag.pupas", value: 1 }]
};

/** Whether an item currently grants its modifiers. */
export function itemIsActive(item) {
  const system = item.system ?? {};
  switch (item.type) {
    case "armor":
    case "weapon":
      return Boolean(system.equipped);
    case "gear":
      if (system.category === "skillChip") return Boolean(system.loaded);
      return Boolean(system.equipped);
    case "implant":
      return system.installed !== false && !system.offline && !system.supreme?.enabled;
    case "feat":
    case "power":
      return system.toggle ? Boolean(system.active) : true;
    case "race":
      return true;
    default:
      return false;
  }
}

function itemModifierList(item) {
  const list = Array.isArray(item.system?.modifiers) ? [...item.system.modifiers] : [];
  if (!list.length && item.type === "feat") list.push(...(LEGACY_FEAT_MODIFIERS[item.name.toLocaleLowerCase("es")] ?? []));
  if (item.type === "implant") {
    for (const upgrade of item.system.upgrades ?? []) {
      if (upgrade.installed) list.push(...(upgrade.modifiers ?? []));
    }
    // Supreme implants are "installed" but never grant passive modifiers (they work per use).
  }
  return list;
}

/**
 * Sums the modifiers of every active item.
 * @returns {{values: Record<string, number>, flags: Set<string>, sources: Record<string, string[]>}}
 */
export function collectModifiers(actor, data = {}) {
  const values = {};
  const flags = new Set();
  const sources = {};
  const powerDie = Number(actor.system?.attributes?.power?.die || 0);
  for (const item of actor.items ?? []) {
    if (!itemIsActive(item)) continue;
    for (const modifier of itemModifierList(item)) {
      if (!modifier?.target) continue;
      let value;
      if (modifier.value === "zumosol") value = powerDie >= 8 ? 2 : 1;
      else value = evaluateFormula(modifier.value, data);
      const target = String(modifier.target);
      if (target.startsWith("flag.")) {
        if (value) flags.add(target.slice(5));
        continue;
      }
      values[target] = (values[target] ?? 0) + value;
      (sources[target] ??= []).push(item.name);
    }
  }
  return { values, flags, sources };
}

export function modifierValue(collected, target) {
  return Number(collected?.values?.[target] ?? 0);
}

/** Item names in lower case, used by rules that depend on knowing a feat. */
export function itemNameSet(actor, type) {
  return new Set(actor.items.filter(item => !type || item.type === type).map(item => item.name.toLocaleLowerCase("es")));
}

export function hasItemNamed(actor, name, type) {
  const target = name.toLocaleLowerCase("es");
  return actor.items.some(item => (!type || item.type === type) && item.name.toLocaleLowerCase("es") === target);
}
