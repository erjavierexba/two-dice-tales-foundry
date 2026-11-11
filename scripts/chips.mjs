import { TDT } from "./config.mjs";

/** Los tres chips del AVS: cada uno solo puede apuntar a su propia lista. */
export const CHIP_KINDS = {
  skill: "Chip de habilidad",
  combat: "Chip de combate",
  defense: "Chip de defensa"
};

export const COMBAT_CHIP_SKILLS = ["ranged", "melee", "brawl", "hacking"];
export const DEFENSE_CHIP_TARGETS = ["evasion", "fortitude", "will"];

/** Tipo del chip; los chips antiguos sin tipo se deducen de su destino. */
export function chipKindOf(system = {}) {
  if (CHIP_KINDS[system.chipKind]) return system.chipKind;
  if (DEFENSE_CHIP_TARGETS.includes(system.chipTarget)) return "defense";
  if (COMBAT_CHIP_SKILLS.includes(system.chipTarget)) return "combat";
  return "skill";
}

/** Destinos válidos para un tipo de chip, con la opción vacía al principio. */
export function chipTargetsFor(kind) {
  const entries = kind === "defense"
    ? DEFENSE_CHIP_TARGETS.map(key => [key, TDT.attackDefenses[key]])
    : kind === "combat"
      ? COMBAT_CHIP_SKILLS.map(key => [key, TDT.skills[key]])
      : [...Object.entries(TDT.skills).filter(([key]) => !COMBAT_CHIP_SKILLS.includes(key)), ["driving", "Conducir (dote)"]];
  return { "": "—", ...Object.fromEntries(entries) };
}

export function chipTargetAllowed(kind, target) {
  return !target || target in chipTargetsFor(kind);
}
