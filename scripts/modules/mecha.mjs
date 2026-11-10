import { TDT } from "../config.mjs";
import { DIE_SIZES, dieScore, evaluateFormula, normalizeDie } from "../dice.mjs";
import { parseWeaponProperties } from "../attack.mjs";

/** Steps a mecha die. Below d4 it becomes a flat 1 (returns 0 faces). */
export function stepMechaDie(die, steps = 0) {
  const index = DIE_SIZES.indexOf(normalizeDie(die) || 4) + Number(steps || 0);
  if (index < 0) return 0;
  return DIE_SIZES[Math.min(DIE_SIZES.length - 1, index)];
}

/** "2d8", "1d8+1d6", "1d4+1" → steps every die. */
export function stepDiceFormula(formula, steps = 0) {
  return String(formula).replace(/(\d+)d(\d+)/g, (_, count, faces) => {
    const stepped = stepMechaDie(Number(faces), steps);
    return stepped ? `${count}d${stepped}` : `${count}`;
  });
}

/** Inventory points spent on upgrading a module from d4 to its current die. */
export function moduleUpgradeCost(die, category) {
  const target = DIE_SIZES.indexOf(normalizeDie(die) || 4);
  let cost = 0;
  for (let index = 1; index <= target; index++) cost += dieScore(DIE_SIZES[index]) + Number(category || 1);
  return cost;
}

export function itemInventoryCost(item, category) {
  const system = item.system ?? {};
  let formula = "";
  if (item.type === "weapon") formula = system.mecha?.inventoryCost ?? "";
  else formula = system.inventoryCost ?? "";
  if (formula === "" || formula === null || formula === undefined) return 0;
  const quantity = item.type === "gear" ? Math.max(1, Number(system.quantity || 1)) : 1;
  return evaluateFormula(formula, { cat: category }) * quantity;
}

export function categoryStats(category) {
  return TDT.mechaCategories[Math.max(1, Math.min(7, Number(category) || 1))];
}

/** Derived data for a mecha actor. Modifiers come from its feats and equipment. */
export function prepareMecha(actor, collected) {
  const system = actor.system;
  const category = Math.max(1, Math.min(7, Number(system.category) || 1));
  const base = categoryStats(category);
  const value = target => Number(collected.values[target] ?? 0);
  system.categoryStats = base;
  system.dice = {
    robustness: stepMechaDie(base.robustness, value("mecha.step.robustness")),
    maneuver: stepMechaDie(base.maneuver, value("mecha.step.maneuver")),
    displacement: stepDiceFormula(base.displacement, value("mecha.step.displacement"))
  };
  const shieldBonus = actor.items
    .filter(item => item.type === "weapon" && item.system.equipped && parseWeaponProperties(item.system.properties).shield)
    .length * 2;
  system.endurance.value = Math.max(0, base.endurance + value("mecha.endurance") + shieldBonus);
  system.endurance.shield = shieldBonus;
  system.health.max = Math.max(1, base.health + value("mecha.health"));
  system.health.effectiveMax = system.health.max;
  const moduleCost = Object.values(system.modules ?? {}).reduce((sum, die) => sum + moduleUpgradeCost(die, category), 0);
  const itemCost = actor.items.reduce((sum, item) => sum + itemInventoryCost(item, category), 0);
  system.inventory.max = base.inventory + Number(system.inventory.bonus || 0) + value("mecha.inventory");
  system.inventory.spent = moduleCost + itemCost;
  system.inventory.moduleCost = moduleCost;
  system.inventory.remaining = system.inventory.max - system.inventory.spent;
  system.size = base.size;
  system.cruise = base.cruise;
  system.aiCameras = value("mecha.perception") > 0 || collected.flags.has("aiCameras");
}

/** Resolves Golpe múltiple: declared hits limited by the formula result. */
export function resolveMultiHit(props, declared, rolledFormula) {
  if (!props?.multiHit || !declared) return { hits: 0, damage: 0 };
  const allowed = rolledFormula === null || rolledFormula === undefined
    ? Number(props.multiHit.max || declared)
    : Math.floor(Number(rolledFormula));
  const hits = Math.max(0, Math.min(declared, allowed, Number(props.multiHit.max || declared)));
  return { hits, damage: hits * Number(props.multiHit.damage || 0) };
}

export function overloadResult(roll, integrated) {
  return TDT.mechaOverloadTable[integrated ? "integrated" : "external"][roll];
}

/** Charge damage bonus: size tag + category (or + 2 × category with a thruster). */
export function chargeBonus(props, category, thruster) {
  return Number(props?.size || 0) + (thruster ? 2 : 1) * Number(category || 1);
}
