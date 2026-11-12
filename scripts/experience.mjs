/**
 * Experience costs of the basic module ("Experiencia"). Pure functions, shared by the sheet and the tests.
 *
 *  - Characteristic or Esquiva/Fortaleza/Voluntad die: twice the faces of the next die (d4 → d6 = 12).
 *  - Skill: the faces of the next die (no die → d4 = 4, d6 → d8 = 8).
 *  - Feats: their cost; disadvantages (negative cost) give experience.
 *  - The maximum is d12.
 */
import { DIE_SIZES, normalizeDie } from "./dice.mjs";

export const IMPROVABLE_KINDS = {
  attribute: "Característica",
  defense: "Dado defensivo",
  skill: "Habilidad"
};

/** Skills whose improvement costs half (Diamante en bruto de tu profesión, the dwarf's Construir). */
const HALF_COST_SOURCES = [
  { type: "feat", name: "diamante en bruto de tu profesión", skill: "profession" },
  { type: "race", name: "enano", skill: "crafting" }
];

/** Next die of a stat, or null at d12. A skill without die (0) goes to d4; characteristics start at d4. */
export function nextDie(kind, die) {
  const current = normalizeDie(die);
  if (!current) return kind === "skill" ? 4 : 6;
  const index = DIE_SIZES.indexOf(current);
  return index < DIE_SIZES.length - 1 ? DIE_SIZES[index + 1] : null;
}

/** Previous die (undoing an improvement). A skill at d4 goes back to no die. */
export function previousDie(kind, die) {
  const current = normalizeDie(die);
  const index = DIE_SIZES.indexOf(current);
  if (index <= 0) return kind === "skill" ? 0 : 4;
  return DIE_SIZES[index - 1];
}

export function improvementCost(kind, die, { half = false } = {}) {
  const next = nextDie(kind, die);
  if (!next) return null;
  const cost = kind === "skill" ? next : next * 2;
  return half ? Math.ceil(cost / 2) : cost;
}

/**
 * Skills with half cost for an actor-like object ({ items, flags }).
 * Also honours the modifier flag "halfXp.<skill>" so homebrew feats can do the same.
 */
export function halfCostSkills({ items = [], flags = new Set() } = {}) {
  const skills = new Set();
  for (const source of HALF_COST_SOURCES) {
    if (items.some(item => item.type === source.type && String(item.name).toLocaleLowerCase("es") === source.name)) skills.add(source.skill);
  }
  for (const flag of flags) if (String(flag).startsWith("halfXp.")) skills.add(String(flag).slice(7));
  return skills;
}

/**
 * Every improvement available to a character.
 * @param {object} data { attributes, defenses, skills: {key: {label, die}}, experience, half: Set }
 */
export function improvementOptions({ attributes = {}, defenses = {}, skills = {}, available = 0, half = new Set() }) {
  const entry = (kind, key, stat) => {
    const die = normalizeDie(stat.die);
    const next = nextDie(kind, die);
    const halved = kind === "skill" && half.has(key);
    const cost = improvementCost(kind, die, { half: halved });
    return {
      kind,
      key,
      label: stat.label,
      die,
      next,
      cost,
      half: halved,
      max: next === null,
      affordable: next !== null && cost <= available
    };
  };
  return [
    ...Object.entries(attributes).map(([key, stat]) => entry("attribute", key, stat)),
    ...Object.entries(defenses).map(([key, stat]) => entry("defense", key, stat)),
    ...Object.entries(skills).map(([key, stat]) => entry("skill", key, stat))
  ];
}

/** "d6", or "+1" for a skill without die. */
export function dieLabel(die) {
  return normalizeDie(die) ? `d${normalizeDie(die)}` : "+1";
}

/**
 * Dice as they were before the improvements bought with experience (for the creation check).
 * @param {{kind: string, key: string}[]} log
 */
export function stepsBought(log = [], kind, key) {
  return log.filter(entry => entry.kind === kind && entry.key === key).length;
}
