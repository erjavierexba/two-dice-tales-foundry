import assert from "node:assert/strict";
import { dieLabel, halfCostSkills, improvementCost, improvementOptions, nextDie, previousDie, stepsBought } from "../scripts/experience.mjs";

// Característica o dado defensivo: el doble del dado al que sube.
assert.equal(improvementCost("attribute", 4), 12);
assert.equal(improvementCost("attribute", 10), 24);
assert.equal(improvementCost("defense", 6), 16);
assert.equal(improvementCost("attribute", 12), null, "d12 es el máximo");
// Habilidad: el dado al que sube; sin dado pasa a d4 por 4.
assert.equal(improvementCost("skill", 0), 4);
assert.equal(improvementCost("skill", 6), 8);
assert.equal(improvementCost("skill", 8, { half: true }), 5, "la mitad redondea hacia arriba");
assert.equal(nextDie("skill", 0), 4);
assert.equal(nextDie("attribute", 12), null);
assert.equal(previousDie("skill", 4), 0);
assert.equal(previousDie("attribute", 6), 4);
assert.equal(dieLabel(0), "+1");
assert.equal(dieLabel(8), "d8");

const half = halfCostSkills({
  items: [{ type: "feat", name: "Diamante en bruto de tu profesión" }, { type: "race", name: "Enano" }],
  flags: new Set(["halfXp.medicine"])
});
assert.deepEqual([...half].sort(), ["crafting", "medicine", "profession"]);

const options = improvementOptions({
  attributes: { power: { label: "Potencia", die: 12 }, mind: { label: "Mente", die: 6 } },
  defenses: { will: { label: "Voluntad", die: 6 } },
  skills: { crafting: { label: "Construir", die: 6 }, athletics: { label: "Atletismo", die: 0 } },
  available: 8,
  half: new Set(["crafting"])
});
const byKey = Object.fromEntries(options.map(option => [option.key, option]));
assert.equal(byKey.power.max, true);
assert.equal(byKey.power.affordable, false, "d12 no se puede mejorar");
assert.equal(byKey.mind.cost, 16);
assert.equal(byKey.mind.affordable, false, "sin XP suficiente no se puede");
assert.equal(byKey.crafting.cost, 4, "Construir a mitad de coste");
assert.equal(byKey.crafting.affordable, true);
assert.equal(byKey.athletics.cost, 4);
assert.equal(stepsBought([{ kind: "skill", key: "athletics" }, { kind: "skill", key: "athletics" }, { kind: "attribute", key: "athletics" }], "skill", "athletics"), 2);

console.log("TDT experience checks: OK");
