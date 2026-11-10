import assert from "node:assert/strict";
import { applyBonus, chooseAutomaticBonus, dieScore, resolveTdtRoll, stepDie } from "../scripts/dice.mjs";

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

console.log("TDT dice tests: OK");
