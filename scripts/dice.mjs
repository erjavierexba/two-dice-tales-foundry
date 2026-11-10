export const DIE_SIZES = [4, 6, 8, 10, 12];

export function normalizeDie(value) {
  const die = Number(value) || 0;
  return DIE_SIZES.includes(die) ? die : 0;
}

export function stepDie(value, steps = 0) {
  const die = normalizeDie(value);
  if (!die) return steps > 0 ? DIE_SIZES[Math.min(steps - 1, DIE_SIZES.length - 1)] : 0;
  const index = DIE_SIZES.indexOf(die);
  return DIE_SIZES[Math.max(0, Math.min(DIE_SIZES.length - 1, index + Number(steps || 0)))];
}

/** Steps a die that may not drop below d4 (attributes, defenses, mecha dice). */
export function stepRolledDie(value, steps = 0) {
  return stepDie(normalizeDie(value) || 4, steps) || 4;
}

export function dieScore(value) {
  const die = normalizeDie(value);
  return die ? DIE_SIZES.indexOf(die) + 1 : 0;
}

/** Number of increments needed to reach a die from d4 (d4 = 0, d6 = 1…). */
export function dieIncrements(value, from = 4) {
  const die = normalizeDie(value);
  if (!die) return 0;
  return Math.max(0, DIE_SIZES.indexOf(die) - Math.max(-1, DIE_SIZES.indexOf(normalizeDie(from))));
}

export function applyBonus(results, faces, allocations) {
  return results.map((result, index) => {
    if (!faces[index] || result === 1) return result;
    return Math.min(faces[index], result + Math.max(0, Number(allocations[index]) || 0));
  });
}

/**
 * Resolves the two (or three, with "vincula voluntad") dice of a TDT roll.
 * The optional third die is the pilot's will die: it can join a critical but never a fumble.
 */
export function resolveTdtRoll({ rawResults, faces, bonusAllocations = [0, 0, 0], penalty = 0, difficulty = 0, flat = 0 }) {
  const adjusted = applyBonus(rawResults, faces, bonusAllocations);
  const [a, b] = adjusted;
  const hasPair = faces[0] > 0 && faces[1] > 0;
  const hasLinked = faces.length > 2 && faces[2] > 0;
  // A fixed value (no skill die: "suma 1") counts as a 1, so 1 + fixed 1 is a fumble too.
  // Criticals still need two real dice.
  const isFumble = a === 1 && b === 1;
  let criticalBonus = 0;
  let criticalValue = 0;
  if (hasPair && a > 1 && a === b) {
    criticalValue = a;
    criticalBonus = a;
    if (hasLinked && adjusted[2] === a) criticalBonus += a;
  } else if (hasLinked && adjusted[2] > 1 && (adjusted[2] === a || (faces[1] > 0 && adjusted[2] === b))) {
    criticalValue = adjusted[2];
    criticalBonus = adjusted[2];
  }
  const isCritical = criticalBonus > 0;
  const subtotal = adjusted.reduce((total, value) => total + value, 0) + (Number(flat) || 0);
  const appliedPenalty = Math.max(0, Number(penalty) || 0);
  const total = Math.max(0, subtotal + criticalBonus - appliedPenalty);
  const target = Math.max(0, Number(difficulty) || 0);
  return {
    rawResults,
    adjusted,
    subtotal,
    criticalBonus,
    criticalValue,
    penalty: appliedPenalty,
    flat: Number(flat) || 0,
    total,
    difficulty: target,
    success: target ? !isFumble && total >= target : null,
    margin: target ? total - target : null,
    isCritical,
    isFumble
  };
}

/**
 * Picks the best way to spread "bonifica X" between the dice (never on a 1, never above the maximum).
 * Prefers the highest total, then a critical, then spending as little as possible.
 */
export function chooseAutomaticBonus(rawResults, faces, bonus, { flat = 0 } = {}) {
  const available = Math.max(0, Number(bonus) || 0);
  const zero = rawResults.map(() => 0);
  if (!available) return zero;
  const maximums = rawResults.map((result, index) => {
    if (!faces[index] || result === 1) return 0;
    return Math.min(available, Math.max(0, faces[index] - result));
  });
  let best = zero;
  let bestScore = [-1, -1, 1];
  const current = zero.slice();
  const visit = index => {
    if (index === rawResults.length) {
      const spent = current.reduce((sum, value) => sum + value, 0);
      if (spent > available) return;
      const result = resolveTdtRoll({ rawResults, faces, bonusAllocations: current, flat });
      const score = [result.total, result.isCritical ? 1 : 0, -spent];
      for (let i = 0; i < score.length; i++) {
        if (score[i] > bestScore[i]) {
          best = current.slice();
          bestScore = score;
          return;
        }
        if (score[i] < bestScore[i]) return;
      }
      return;
    }
    for (let value = 0; value <= maximums[index]; value++) {
      current[index] = value;
      visit(index + 1);
    }
    current[index] = 0;
  };
  visit(0);
  return best;
}

/** Result tiers used by magic circles and simple magic ("superado perfecto"). */
export function perfectSuccess(result) {
  return Boolean(result.success && (result.isCritical || (result.margin ?? 0) >= 5));
}

/** Evaluates small numeric formulas used by the content, such as "2+@cat" or "3 + 3 x categoría". */
export function evaluateFormula(formula, data = {}) {
  if (typeof formula === "number") return formula;
  if (formula === null || formula === undefined || formula === "") return 0;
  let expression = String(formula)
    .toLocaleLowerCase("es")
    .replace(/categoría|categoria|@cat/g, String(Number(data.cat) || 0))
    .replace(/[x×]/g, "*")
    .replace(/,/g, ".");
  for (const [key, value] of Object.entries(data)) expression = expression.replaceAll(`@${key}`, String(Number(value) || 0));
  if (!/^[\d+\-*/(). ]+$/.test(expression)) return Number.parseFloat(expression) || 0;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expression});`)();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}
