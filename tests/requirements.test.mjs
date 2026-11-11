import assert from "node:assert/strict";
import { checkItemRequirements } from "../scripts/requirements.mjs";

const item = (name, extra = {}) => ({ name, type: "feat", system: { requirements: "", description: "", ...extra } });
const actor = (items = [], system = {}) => ({
  items,
  system: {
    attributes: { power: { die: 6 }, dexterity: { die: 4 }, mind: { die: 6 }, social: { die: 4 } },
    defenses: { evasion: { die: 4 }, fortitude: { die: 4 }, will: { die: 6 } },
    skills: { science: { die: 4 }, investigation: { die: 6 }, ranged: { die: 8 }, melee: { die: 6 }, brawl: { die: 4 }, arcana: { die: 8 } },
    fantasy: { magicSkill: "arcana" },
    ...system
  }
});

assert.equal(checkItemRequirements(actor(), item("Análisis", { requirements: "Ciencia 1d4, Investigación 1d6" })).ok, true);
assert.deepEqual(checkItemRequirements(actor(), item("Disparo", { requirements: "Puntería 1d12 o combate cac 1d12" })).missing, ["Puntería 1d12 o combate cac 1d12"]);
assert.equal(checkItemRequirements(actor([item("Oído fino")]), item("Murciélago", { requirements: "Oído fino" })).ok, true);
assert.equal(checkItemRequirements(actor(), item("Murciélago", { requirements: "Oído fino" })).ok, false);
assert.equal(checkItemRequirements(actor([item("Cegato")]), item("Vista de cazador", { description: "Prohibido en caso de coger Cegato. Mejora la vista." })).ok, false);
assert.equal(checkItemRequirements(actor([item("Vista de cazador", { description: "Prohibido en caso de coger Cegato. Mejora la vista." })]), item("Cegato")).ok, false);
assert.equal(checkItemRequirements(actor([item("Modificador: Forma"), item("Modificador: Área")]), item("Conjuro", { requirements: "Forma, Área" })).ok, true);
assert.equal(checkItemRequirements(actor([item("Magia A", { module: "fantasy" }), item("Magia B", { tags: ["Magia"] }), item("Magia C", { module: "fantasy" })]), item("Reserva", { requirements: "3 dotes mágicas aprendidas, aptitud mágica d8" })).ok, true);
assert.equal(checkItemRequirements(actor(), item("Narrativa", { requirements: "Una criatura enemiga muere por un ataque tuyo." })).ok, true);
assert.equal(checkItemRequirements(actor([item("Iniciado arcano")]), item("Magia avanzada", { requirements: "símbolo metafísico Magia" })).ok, true);

console.log("TDT requirement checks: OK");
