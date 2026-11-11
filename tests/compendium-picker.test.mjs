import assert from "node:assert/strict";
import { categoriesForType, pickerCategory } from "../scripts/compendium-picker.mjs";

const entry = (type, name, system = {}) => ({ type, name, system });
assert.equal(pickerCategory(entry("armor", "Ropa", { endurance: 1 })), "light");
assert.equal(pickerCategory(entry("armor", "Placas", { endurance: 2 })), "medium");
assert.equal(pickerCategory(entry("armor", "Asalto", { endurance: 4 })), "heavy");
assert.equal(pickerCategory(entry("weapon", "CaC ligera", { damage: 3 })), "light");
assert.equal(pickerCategory(entry("weapon", "Fusil", { damage: 6 })), "medium");
assert.equal(pickerCategory(entry("weapon", "Bazooka", { damage: 8, properties: "Potencia 1d6" })), "heavy");
assert.equal(pickerCategory(entry("weapon", "Granada", { damage: 0, properties: "Área 6" })), "other");
assert.equal(pickerCategory(entry("gear", "Coche", { category: "vehicle" })), "vehicle");
assert.deepEqual(categoriesForType("armor"), ["all", "light", "medium", "heavy", "other"]);

console.log("TDT compendium picker checks: OK");
