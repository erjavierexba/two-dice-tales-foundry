import assert from "node:assert/strict";
import { applyBonus, chooseAutomaticBonus, dieScore, resolveTdtRoll, stepDie, stepDieToOne } from "../scripts/dice.mjs";

assert.equal(dieScore(4), 1);
assert.equal(dieScore(12), 5);
assert.equal(stepDie(6, 1), 8);
assert.equal(stepDie(4, -1), 4);
assert.equal(stepDie(12, 2), 12);

assert.deepEqual(applyBonus([4, 6], [6, 8], [2, 0]), [6, 6]);
assert.deepEqual(applyBonus([1, 4], [6, 6], [2, 0]), [1, 4]);
assert.deepEqual(chooseAutomaticBonus([4, 6], [6, 8], 2), [2, 0]);
assert.deepEqual(chooseAutomaticBonus([1, 4], [6, 6], 2), [0, 2]);
assert.deepEqual(chooseAutomaticBonus([6, 6], [6, 6], 3), [0, 0]);
assert.deepEqual(chooseAutomaticBonus([3, 5], [6, 6], 2), [2, 0]);

const critical = resolveTdtRoll({ rawResults: [4, 4], faces: [4, 6] });
assert.equal(critical.isCritical, true);
assert.equal(critical.total, 12);

const fumble = resolveTdtRoll({ rawResults: [1, 1], faces: [4, 8], difficulty: 2 });
assert.equal(fumble.isFumble, true);
assert.equal(fumble.success, false);

const modified = resolveTdtRoll({
  rawResults: [3, 5],
  faces: [6, 6],
  bonusAllocations: [2, 0],
  penalty: 2,
  difficulty: 10
});
assert.equal(modified.isCritical, true);
assert.equal(modified.total, 13);
assert.equal(modified.success, true);

const untrained = resolveTdtRoll({ rawResults: [4, 1], faces: [6, 0], difficulty: 5 });
assert.equal(untrained.isFumble, false);
assert.equal(untrained.total, 5);
assert.equal(untrained.success, true);

const untrainedFumble = resolveTdtRoll({ rawResults: [1, 1], faces: [6, 0], difficulty: 2 });
assert.equal(untrainedFumble.isFumble, true, "1 en la característica + 1 fijo sin habilidad es pifia");
assert.equal(untrainedFumble.success, false);
assert.equal(untrainedFumble.isCritical, false);
assert.deepEqual(applyBonus([1, 1], [6, 0], [2, 2]), [1, 1], "ni un 1 ni el valor fijo se bonifican");

console.log("TDT dice tests: OK");

// Cobarde, Incrédulo, Posición ofensiva: un d4 reducido pasa a ser un 1 fijo.
assert.equal(stepDieToOne(4, -1), 0);
assert.equal(stepDieToOne(6, -1), 4);
assert.equal(stepDieToOne(6, -2), 0);
assert.equal(stepDieToOne(8, 1), 10);

// Golpe vital: el número del crítico se suma una vez más (4+4+4 → 4+4+4+4).
assert.equal(resolveTdtRoll({ rawResults: [4, 4], faces: [6, 6] }).total, 12);
assert.equal(resolveTdtRoll({ rawResults: [4, 4], faces: [6, 6], criticalExtra: 1 }).total, 16);
assert.equal(resolveTdtRoll({ rawResults: [3, 4], faces: [6, 6], criticalExtra: 1 }).total, 7);
