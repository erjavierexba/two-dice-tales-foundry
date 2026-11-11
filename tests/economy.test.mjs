import assert from "node:assert/strict";
import { mergeLegacyMoney, normalizeMoney } from "../scripts/economy.mjs";

assert.equal(normalizeMoney(12.345), 12.35, "redondea a céntimos");
assert.equal(normalizeMoney(0.1 + 0.2), 0.3, "evita residuos de coma flotante");
assert.equal(normalizeMoney(-5), 0, "el saldo no puede ser negativo");
assert.equal(normalizeMoney("no es dinero"), 0, "un valor inválido se sanea");
assert.equal(mergeLegacyMoney(12, 34), 12.34, "migra unidad y submoneda a un único saldo");

console.log("TDT economy checks: OK");
