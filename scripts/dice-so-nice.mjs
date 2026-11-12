/**
 * Optional Dice So Nice integration (recommended, never required): the characteristic die and the
 * skill (or defense) die get their own colours, so the two dice of a roll are told apart at a glance.
 */
const SYSTEM = "tdt";

export const DSN_COLORSETS = {
  attribute: { name: "tdt-attribute", description: "TDT · Característica", category: "Two Dice Tales", foreground: "#ffffff", background: "#1f6170", outline: "#102b34", edge: "#d9aa49", material: "plastic" },
  skill: { name: "tdt-skill", description: "TDT · Habilidad", category: "Two Dice Tales", foreground: "#ffffff", background: "#b93e36", outline: "#842923", edge: "#f4d98f", material: "plastic" },
  extra: { name: "tdt-extra", description: "TDT · Dado extra", category: "Two Dice Tales", foreground: "#18232b", background: "#eee9dc", outline: "#c8bda7", edge: "#c8bda7", material: "plastic" }
};

export function registerDiceSoNice() {
  game.settings.register(SYSTEM, "dsnColors", {
    name: "Dice So Nice: colores de TDT",
    hint: "Con el módulo Dice So Nice activo, el dado de característica sale azul y el de habilidad rojo. Desactívalo para usar tus propios colores.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
  Hooks.once("diceSoNiceReady", dice3d => {
    for (const colorset of Object.values(DSN_COLORSETS)) dice3d.addColorset(colorset, "no");
  });
}

function dsnColorsActive() {
  if (!game.modules?.get("dice-so-nice")?.active) return false;
  try {
    return Boolean(game.settings.get(SYSTEM, "dsnColors"));
  } catch {
    return false;
  }
}

/** Marks every die of a roll with the colorset of its slot ("attribute", "skill" or "extra"). */
export function paintRoll(roll, slot) {
  if (!dsnColorsActive() || !DSN_COLORSETS[slot]) return roll;
  for (const die of roll.dice ?? []) die.options.appearance = { ...(die.options.appearance ?? {}), colorset: DSN_COLORSETS[slot].name };
  return roll;
}
