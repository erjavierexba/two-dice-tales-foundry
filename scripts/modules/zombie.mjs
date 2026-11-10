import { dieScore } from "../dice.mjs";

/** Automatic penalties from zombification and hunger, as roll rules (scopes filtered by the roll). */
export function zombieStatusRules(system) {
  const rules = [];
  const z = Number(system.zombie?.zombification || 0);
  const h = Number(system.zombie?.hunger || 0);
  if (z >= 4) rules.push({ type: "penalty", value: 3, scopes: [], label: "Zombificación 4" });
  else if (z === 3) {
    rules.push({ type: "penalty", value: 2, scopes: ["evasion"], label: "Zombificación 3 (Esquiva)" });
    rules.push({ type: "penalty", value: 2, scopes: ["perception", "ranged"], label: "Zombificación 3 (Percepción y Puntería)", exclusive: "z3" });
    rules.push({ type: "penalty", value: 1, scopes: [], label: "Zombificación 3", excludeScopes: ["evasion", "perception", "ranged"] });
  } else if (z === 2) {
    rules.push({ type: "penalty", value: 1, scopes: ["perception", "ranged"], label: "Zombificación 2 (vista nublada)" });
  }
  if (h >= 4) rules.push({ type: "penalty", value: 3, scopes: [], label: "Hambruna 4" });
  else {
    if (h >= 1) rules.push({ type: "penalty", value: 1, scopes: ["power", "dexterity"], label: "Hambruna 1 (Potencia y Destreza)" });
    if (h >= 2) rules.push({ type: "penalty", value: 1, scopes: ["mind", "social"], label: "Hambruna 2 (Mente y Social)" });
  }
  return rules;
}

export function foodNeed(system, modifier = 0) {
  const power = system.attributes?.power;
  return Math.max(0, 4 + dieScore(power?.value ?? power?.die) + Number(modifier || 0));
}

/** Hunger difficulty: missing food + 2 × days without eating enough (min 1). */
export function hungerDifficulty(need, eaten, days) {
  return Math.max(0, need - eaten) + 2 * Math.max(1, days);
}

/** Next day's hunger state when eating enough. */
export function hungerRecovery(hunger, need, eaten) {
  if (eaten >= need * 2) return Math.max(0, hunger - 2);
  if (eaten >= need) return Math.max(0, hunger - 1);
  return hunger;
}

export function biteDifficulty(flags, source = "bite") {
  let difficulty = source === "acid" ? 4 : 10;
  if (flags.has("antibodiesZ")) difficulty -= 2;
  if (flags.has("antibodiesHorrible")) difficulty += 2;
  return difficulty;
}

/**
 * Zombie group (2–6 basic zombies): total HP, +1 attack/grab difficulty per remaining zombie,
 * non-area attacks capped at one zombie's max HP, area attacks +1 per extra zombie.
 */
export function zombieGroupStats(count, currentHealth, baseHealth = 5) {
  const size = Math.max(1, Math.min(6, Number(count) || 1));
  const health = currentHealth === undefined ? size * baseHealth : Math.max(0, Number(currentHealth) || 0);
  const remaining = Math.min(size, Math.ceil(health / baseHealth));
  return { size, maxHealth: size * baseHealth, remaining, attackBonus: remaining, damageCap: baseHealth, areaBonus: Math.max(0, remaining - 1) };
}
