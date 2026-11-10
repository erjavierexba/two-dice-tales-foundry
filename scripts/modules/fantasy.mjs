import { TDT } from "../config.mjs";
import { dieScore, perfectSuccess } from "../dice.mjs";

/**
 * Cost of a magic circle.
 * spell.marks: [{ root, subtracted, modifiers: [key], extraPotency }]
 * spell.shared: [{ modifier, marks: [index] }]  (empty marks = every mark)
 */
export function circleCost(spell, { feats = new Set(), hasFocus = true } = {}) {
  const roots = TDT.circleRoots;
  const mods = TDT.circleModifiers;
  const marks = Array.isArray(spell.marks) ? spell.marks : [];
  const shared = Array.isArray(spell.shared) ? spell.shared.filter(entry => mods[entry?.modifier]) : [];
  const variable = feats.has("runa de polaridad variable") ? spell.variablePolarity || "" : "";
  let variableUsed = false;
  const polarityOf = key => {
    if (variable && !variableUsed && key === variable) {
      variableUsed = true;
      return "neutral";
    }
    return mods[key]?.polarity ?? "neutral";
  };
  let potencyCount = 0;
  let counterweight = 0;
  const details = marks.map((mark, index) => {
    const root = roots[mark?.root];
    const own = (mark?.modifiers ?? []).filter(key => mods[key]);
    for (let i = 0; i < Number(mark?.extraPotency || 0); i++) own.push("potency");
    potencyCount += own.filter(key => key === "potency").length;
    const sharedHere = shared.filter(entry => !entry.marks?.length || entry.marks.map(Number).includes(index)).map(entry => entry.modifier);
    const polarities = [...own, ...sharedHere].map(polarityOf);
    const positives = polarities.filter(value => value === "positive").length;
    const negatives = polarities.filter(value => value === "negative").length;
    const surcharge = (positives >= 2 ? positives : 0) + (negatives >= 2 ? negatives : 0);
    const rootCost = root?.cost ?? 0;
    const inscription = rootCost + own.length + surcharge;
    const rootMana = mark?.subtracted && root?.subtract ? 0 : rootCost;
    if (spell.counterweight && feats.has("contrapeso polar")) {
      const ownPolarities = own.map(key => mods[key].polarity);
      if (ownPolarities.includes("positive") && ownPolarities.includes("negative")) counterweight += 2;
    }
    return { index, root: mark?.root, label: root?.label ?? "—", rootCost, rootMana, modifiers: own.length, surcharge, inscription, subtracted: Boolean(mark?.subtracted && root?.subtract) };
  });
  potencyCount += shared.filter(entry => entry.modifier === "potency").length;
  const sharedCost = shared.length;
  const inscription = details.reduce((sum, mark) => sum + mark.inscription, 0) + sharedCost;
  let rootsMana = details.reduce((sum, mark) => sum + mark.rootMana, 0);
  if (feats.has("enlace de marcas") && details.length > 1) rootsMana = Math.max(0, ...details.map(mark => mark.rootMana));
  const modifiersMana = inscription - details.reduce((sum, mark) => sum + mark.rootCost, 0);
  const mana = Math.max(0, rootsMana + modifiersMana - counterweight);
  let difficulty = 2 + inscription;
  if (!hasFocus) difficulty += 2;
  if (spell.subtractExpert && feats.has("sustractor experto") && details.some(mark => mark.subtracted)) difficulty -= 1;
  let damage = 0;
  if (spell.attack?.enabled) {
    damage = 3 + 2 * potencyCount;
    if (spell.attack.manyTargets) damage -= 1;
  }
  return { marks: details, sharedCost, inscription, difficulty, mana, damage, potencyCount };
}

/** Which circle roots and modifiers an actor knows, from its feats. */
export function knownCircleParts(actor) {
  const feats = new Set(actor.items.filter(item => item.type === "feat").map(item => item.name.toLocaleLowerCase("es")));
  const roots = Object.entries(TDT.circleRootFeats)
    .filter(([, names]) => names.some(name => [...feats].some(feat => feat.startsWith(name.toLocaleLowerCase("es")))))
    .map(([key]) => key);
  const modifiers = Object.entries(TDT.circleModifiers)
    .filter(([, data]) => feats.has(`modificador: ${data.label.toLocaleLowerCase("es")}`))
    .map(([key]) => key);
  return { roots: new Set(roots), modifiers: new Set(modifiers), feats };
}

export function manaMax(actor, modifiers = 0) {
  const system = actor.system;
  const attribute = system.attributes[system.fantasy?.magicAttribute || "mind"];
  const skill = system.skills[system.fantasy?.magicSkill || "arcana"];
  return 6 + 2 * dieScore(attribute?.value ?? attribute?.die) + dieScore(skill?.value ?? skill?.die) + modifiers;
}

export function incrementalReserve(actor) {
  const attribute = actor.system.attributes[actor.system.fantasy?.magicAttribute || "mind"];
  return dieScore(attribute?.value ?? attribute?.die);
}

/** Applies an Incremental N spent after a successful cast. */
export function applyIncremental(state, increment, reserveMax) {
  const free = Math.max(0, reserveMax - Number(state.reserveUsed || 0));
  const absorbed = Math.min(increment, free);
  return {
    reserveUsed: Number(state.reserveUsed || 0) + absorbed,
    difficulty: Number(state.difficulty || 2) + increment - absorbed
  };
}

export function hasInnerMagic(actor) {
  return actor.items.some(item => item.type === "feat" && item.name.toLocaleLowerCase("es") === "magia interior");
}

/** Simple-magic feat: Incremental value, taking related feats into account. */
export function simpleSpellIncrement(actor, feat, { boostedDamage = false, boostedRange = false } = {}) {
  let increment = Number(feat.system.incremental || 0);
  const names = new Set(actor.items.filter(item => item.type === "feat").map(item => item.name.toLocaleLowerCase("es")));
  if (feat.name.toLocaleLowerCase("es") === "proyectil mágico" && names.has("eficiencia mágica")) increment = 1;
  if (boostedDamage) increment += 1;
  if (boostedRange) increment += 1;
  return increment;
}

export function circleResultText(result) {
  if (result.isFumble) return "El círculo se rompe: pierdes todo el maná y el DJ aplica una consecuencia mágica lógica.";
  if (perfectSuccess(result)) return "Superado perfecto: el círculo sale limpio. Añade un beneficio menor (+1 al efecto, +1 daño, mejor duración o una propiedad elemental narrativa).";
  if (result.success) return "Éxito: el hechizo se ejecuta normalmente.";
  return "Fallo: el círculo no prende. Pierdes la mitad del coste de maná (redondeando hacia arriba).";
}
