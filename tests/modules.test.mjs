import assert from "node:assert/strict";
import { resolveTdtRoll } from "../scripts/dice.mjs";
import { parseWeaponProperties, finalDamage } from "../scripts/attack.mjs";
import * as Fantasy from "../scripts/modules/fantasy.mjs";
import * as Mecha from "../scripts/modules/mecha.mjs";
import * as Zombie from "../scripts/modules/zombie.mjs";
import * as Cyber from "../scripts/modules/cyber.mjs";
import * as Vehicle from "../scripts/modules/vehicle.mjs";
import { bestInitiativeCombatant, distributeTeamOrder, initiativeDice } from "../scripts/modules/combat.mjs";

/* Fantasy: the example circles of the manual */
const circle = marks => Fantasy.circleCost({ marks, shared: [] });
let cost = circle([{ root: "magic", modifiers: ["reach", "form"] }]);
assert.deepEqual([cost.inscription, cost.difficulty, cost.mana], [3, 5, 3], "Proyectil mágico básico");
cost = circle([{ root: "magic", modifiers: ["reach", "form", "potency"] }]);
assert.deepEqual([cost.inscription, cost.difficulty, cost.mana], [6, 8, 6], "Proyectil potenciado (sobrecoste 2)");
cost = circle([{ root: "fire", modifiers: ["reach", "area", "form", "potency"] }]);
assert.deepEqual([cost.inscription, cost.difficulty, cost.mana], [9, 11, 9], "Bola de fuego");
cost = circle([{ root: "fire", modifiers: ["reach", "area", "form", "potency"], subtracted: true }]);
assert.equal(cost.mana, 7, "Bola de fuego sustraída");
cost = circle([{ root: "water", modifiers: ["property", "form"] }, { root: "void", modifiers: ["negation"] }]);
assert.deepEqual([cost.difficulty, cost.mana], [9, 7], "Hielo");
cost = circle([{ root: "water", modifiers: ["property", "form"], subtracted: true }, { root: "void", modifiers: ["negation"] }]);
assert.equal(cost.mana, 5, "Hielo con agua disponible");
cost = Fantasy.circleCost({ marks: [{ root: "magic", modifiers: ["reach", "form"] }], attack: { enabled: true } });
assert.equal(cost.damage, 3);
cost = Fantasy.circleCost({ marks: [{ root: "magic", modifiers: ["reach", "form", "potency"] }], attack: { enabled: true } });
assert.equal(cost.damage, 5);
assert.equal(Fantasy.circleCost({ marks: [{ root: "magic", modifiers: [] }] }, { hasFocus: false }).difficulty, 5, "sin foco +2");

/* Fantasy: Incremental with reserve */
let state = { difficulty: 2, reserveUsed: 0 };
state = Fantasy.applyIncremental(state, 1, 2);
state = Fantasy.applyIncremental(state, 1, 2);
assert.deepEqual(state, { reserveUsed: 2, difficulty: 2 }, "dos incrementos gratis con Mente d6");
state = Fantasy.applyIncremental(state, 1, 2);
assert.equal(state.difficulty, 3, "el tercero ya sube la dificultad");

/* Mechas: Vincula voluntad (manual example) */
let roll = resolveTdtRoll({ rawResults: [4, 3, 3], faces: [6, 6, 4] });
assert.equal(roll.total, 13, "4,3 y voluntad 3 = 13");
roll = resolveTdtRoll({ rawResults: [3, 3, 3], faces: [6, 6, 4] });
assert.equal(roll.total, 15, "3,3,3 = 15");
roll = resolveTdtRoll({ rawResults: [1, 1, 4], faces: [6, 6, 4] });
assert.equal(roll.isFumble, true, "el dado de voluntad no evita la pifia");

/* Mechas: module upgrade cost and Golpe múltiple */
assert.equal(Mecha.moduleUpgradeCost(8, 2), (2 + 2) + (3 + 2), "d4→d6→d8 en categoría 2");
const knuckles = parseWeaponProperties("Golpe múltiple(2, 3), Daño 5");
assert.deepEqual(knuckles.multiHit, { formula: "2", max: 2, damage: 3 });
assert.deepEqual(Mecha.resolveMultiHit(knuckles, 1, null), { hits: 1, damage: 3 });
const lmg = parseWeaponProperties("Golpe múltiple(1d4/2[2], 2),Daño 6, Munición (24)");
assert.equal(lmg.multiHit.max, 2);
assert.deepEqual(Mecha.resolveMultiHit(lmg, 2, 0.5), { hits: 0, damage: 0 }, "1 en 1d4/2 no da impactos");
// Manual example: 9 vs 5, Daño 5, aguante 10, one extra hit (+3 after endurance) = 2.
assert.equal(finalDamage({ total: 9, defense: 5, damage: 5, endurance: 10, afterEndurance: 3 }).damage, 2);
assert.equal(Mecha.chargeBonus({ size: 3 }, 2, false), 5);
assert.equal(Mecha.chargeBonus({ size: 3 }, 2, true), 7);
assert.equal(Mecha.stepMechaDie(4, -1), 0, "un d4 reducido pasa a ser +1");
assert.equal(Mecha.stepDiceFormula("1d8+1d6", 1), "1d10+1d8");

/* Zombies */
assert.equal(Zombie.hungerDifficulty(6, 2, 1), 6);
assert.equal(Zombie.hungerDifficulty(6, 2, 3), 10);
assert.equal(Zombie.biteDifficulty(new Set(["antibodiesZ"])), 8);
assert.equal(Zombie.biteDifficulty(new Set(), "acid"), 4);
const group = Zombie.zombieGroupStats(3, 15);
assert.deepEqual([group.remaining, group.attackBonus, group.areaBonus, group.damageCap], [3, 3, 2, 5]);
assert.equal(Zombie.zombieGroupStats(3, 9).remaining, 2, "al quitar 5 PV queda un zombi menos");

/* Cyberpunk */
assert.equal(Cyber.avsSlotCost(1), 0);
assert.equal(Cyber.avsSlotCost(3), 3, "segunda ranura 1 CC, tercera 2 CC");
assert.equal(Cyber.avsSlotCost(5), 7);
const dani = { name: "AVS (Advanced VirtualSelf)", system: { cc: 3, slots: 3, upgrades: [{ name: "Cableado", cc: 1, installed: true }, { name: "Extrafirewall", cc: 2, installed: false }] } };
assert.equal(Cyber.implantCost(dani), 7, "el AVS de Dani consume 7 CC");
assert.equal(Cyber.implantCost({ name: "Copia de seguridad", system: { cc: 0, supreme: { enabled: true } } }), 0);
assert.equal(Cyber.implantTierFromCost(7), "major");
assert.equal(Cyber.excessOutcome({ success: false, total: 3, difficulty: 8, isFumble: false }, 4).key, "snap", "ejemplo de Kira");
assert.equal(Cyber.excessOutcome({ success: false, total: 6, difficulty: 8, isFumble: false }, 4).key, "absorbed");
assert.equal(Cyber.excessOutcome({ success: false, total: 13, difficulty: 14, isFumble: false }, 10).key, "misaligned");
assert.equal(Cyber.marginDuration(0), 1);
assert.equal(Cyber.marginDuration(7), 3);

/* Vehículos: compatibilidad con las entradas antiguas del compendio */
const oldCar = Vehicle.vehicleProfile({ system: {
  description: "Conducir: Coches. Pasajeros: 4. Conducción: -1. Vida: 18. Aguante: 7. Al estampar causa Daño 9.",
  vehicle: { health: { value: 0, max: 0 } }
} });
assert.deepEqual([oldCar.category, oldCar.passengers, oldCar.modifier], ["Coches", 4, -1]);
assert.deepEqual(oldCar.health, { value: 18, max: 18 }, "los vehículos antiguos empiezan con sus PV completos");
assert.deepEqual([oldCar.endurance, oldCar.crashDamage], [7, 9]);
const driver = { items: [
  { type: "feat", name: "Conducir (Coches)" },
  { type: "feat", name: "Kansei Dorifto (Coches)" }
] };
assert.deepEqual(Vehicle.drivingFeat(driver, "Coches"), { trained: true, kansei: true });

/* Combate: una iniciativa por bando y reparto alternado del manual */
assert.deepEqual(distributeTeamOrder(["J1", "J2"], ["E1", "E2", "E3", "E4"], true), ["J1", "E1", "E2", "J2", "E3", "E4"]);
assert.deepEqual(distributeTeamOrder(["J1", "J2", "J3"], ["E1", "E2", "E3", "E4", "E5"], true), ["J1", "E1", "E2", "J2", "E3", "E4", "J3", "E5"]);
assert.deepEqual(distributeTeamOrder(["J1", "J2"], ["E1", "E2", "E3", "E4"], false), ["E1", "J1", "E2", "E3", "J2", "E4"]);
const slow = { name: "Lento", actor: { system: { perception: { faces: 6 } } } };
const alert = { name: "Alerta", actor: { system: { perception: { faces: 10 } } } };
assert.deepEqual(initiativeDice(alert.actor), [10, 10]);
assert.equal(bestInitiativeCombatant([slow, alert]), alert);

/* Weapon properties of the new modules */
const baton = parseWeaponProperties("Dual, Daño 3, Aturdidora 4. Contra robots y máquinas, **Daño 7**.");
assert.deepEqual([baton.damage, baton.stun, baton.vsMachines, baton.dual], [3, 4, 7, true]);
const blade = parseWeaponProperties("Daño 4, Contusión 7. Contra seres vivos, **Daño 8**.");
assert.equal(blade.vsLiving, 8);
const saw = parseWeaponProperties("Daño 6, Contusión 5, Rompearmaduras. **Penaliza en 2** tus tiradas de ataque con ella.");
assert.deepEqual([saw.armorBreaker, saw.attackPenalty], [true, 2]);

console.log("Pruebas de módulos superadas.");

/* Enemies with "-" in a defense are immune to it */
{
  const { targetImmune, targetDefense } = await import("../scripts/attack.mjs");
  const zombie = { type: "npc", system: { npcStats: { evasion: 3, fortitude: 3, will: 0, perception: 5, hacking: 4 } } };
  assert.equal(targetImmune(zombie, "will"), true, "Voluntad «-» = inmune");
  assert.equal(targetDefense(zombie, "will"), null);
  assert.equal(targetImmune(zombie, "evasion"), false);
  assert.equal(targetDefense(zombie, "evasion"), 3);
  assert.equal(targetImmune({ type: "character", system: {} }, "will"), false);
}
