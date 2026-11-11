import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFile(join(root, path), "utf8");
const exists = async path => access(join(root, path)).then(() => true, () => false);

const system = JSON.parse(await read("system.json"));
const pkg = JSON.parse(await read("package.json"));
const template = JSON.parse(await read("template.json"));

assert.equal(system.id, "tdt");
assert.equal(system.version, pkg.version, "system.json y package.json deben compartir versión");
assert.equal(system.compatibility.minimum, "13");
assert.ok(system.relationships?.recommends?.some(entry => entry.id === "dice-so-nice"), "Dice So Nice debe figurar como integración recomendada");
assert.equal(template.Item.implant.installed, false, "los implantes del inventario no empiezan instalados");
assert.equal(template.Item.weapon.condition, "normal", "las armas nuevas empiezan en estado normal");
assert.equal(template.Item.armor.pristine, false, "las armaduras nuevas no empiezan impolutas");
assert.equal(template.Item.weapon.mecha.repairRequired, false);
assert.equal(template.Item.weapon.mecha.destroyed, false);
for (const path of [...system.esmodules, ...system.styles]) assert.ok(await exists(path), `Falta ${path}`);
for (const pack of system.packs) assert.ok(await exists(pack.path), `Falta el compendio ${pack.path}`);
for (const [document, config] of Object.entries(system.documentTypes)) {
  const declared = new Set(template[document]?.types ?? []);
  for (const type of Object.keys(config)) assert.ok(declared.has(type), `${document}.${type} no está en template.json`);
}

for (const file of await readdir(join(root, "scripts"), { recursive: true })) {
  if (!file.endsWith(".mjs")) continue;
  const path = join(root, "scripts", file);
  execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
}

const actorTemplate = await read("templates/actor-sheet.hbs");
const mechaTemplate = await read("templates/mecha-sheet.hbs");
for (const [name, source] of [["actor", actorTemplate], ["mecha", mechaTemplate]]) {
  const itemRows = source.match(/<li class="item tdt-item" data-item-id=/g) ?? [];
  const rawRows = source.match(/<li data-item-id=/g) ?? [];
  assert.ok(itemRows.length > 0, `${name}: no hay filas de objetos arrastrables`);
  assert.equal(rawRows.length, 0, `${name}: quedan filas incompatibles con el drag & drop de Foundry`);
}
assert.match(actorTemplate, /data-action="item-chat"/);
assert.match(actorTemplate, /data-action="item-use"/);
assert.match(actorTemplate, /data-action="compendium-pick"/);
assert.match(actorTemplate, /name="system\.moneyMinor"/);
assert.match(actorTemplate, /tdt-hero-point/);
assert.match(actorTemplate, /tdt-character-economy/);
assert.match(actorTemplate, /name="system\.initiative\.value"/);
assert.match(actorTemplate, /data-actor-method="driveVehicle"/);
assert.match(actorTemplate, /data-actor-method="damageVehicle"/);
assert.match(mechaTemplate, /data-action="activate-tab" data-tab="inventory"/);
assert.match(mechaTemplate, /data-actor-method="mechaRepairWeapon"/);
assert.match(mechaTemplate, /data-action="compendium-pick"/);

const chat = await read("scripts/chat.mjs");
assert.doesNotMatch(chat, /data\?\.action === "update"/);
assert.match(chat, /Dialog\.confirm/);

const actor = await read("scripts/actor.mjs");
assert.match(actor, /rolls:\s*outcome\.rolls/, "las tiradas deben publicarse como Roll de Foundry para Dice So Nice");
const entrypoint = await read("scripts/tdt.mjs");
assert.match(entrypoint, /CONFIG\.Combat\.documentClass\s*=\s*TDTCombat/);

const css = await read("styles/tdt.css");
assert.match(css, /@container tdt-sheet/);
assert.doesNotMatch(css, /height:\s*calc\(100% - 154px\)/);

console.log(`TDT system checks: OK (${relative(process.cwd(), root)})`);

// Dotes del básico: las reglas condicionales salen desmarcadas y ninguna regla mecánica
// con ámbito vacío se aplica sola a todas las tiradas.
{
  const basic = JSON.parse(await read("data/basic-content.json"));
  const feats = basic.items.filter(item => item.type === "feat");
  for (const feat of feats) {
    for (const entry of feat.system.rules ?? []) {
      if (entry.type === "reminder") continue;
      if (!entry.scopes?.length) assert.ok(entry.optional, `${feat.name}: una regla sin ámbito debe ser opcional`);
    }
  }
  const byName = name => feats.find(feat => feat.name === name);
  assert.ok(byName("Cálculo de tiro").system.rules.every(entry => entry.type === "reminder"), "Cálculo de tiro solo amplía el alcance");
  assert.ok(byName("Kansei Dorifto").system.rules.every(entry => entry.type === "reminder"), "Kansei ya lo aplica la tirada de conducir");
  assert.deepEqual(byName("Retaco").system.modifiers.find(entry => entry.target === "step.defense.evasion")?.value, 1);
  assert.equal(byName("Posición ofensiva").system.toggle, true);
  assert.ok(byName("Gordo").system.rules.some(entry => entry.type === "disadvantage" && entry.target === "second"), "Gordo tira dos veces la habilidad");
  assert.deepEqual(byName("Oído fino").system.modifiers, [{ target: "step.perception.auditory", value: 1 }]);
  assert.deepEqual(byName("Vista de cazador").system.modifiers, [{ target: "step.perception.visual", value: 1 }]);
  assert.ok(!byName("Murciélago").system.rules.some(entry => entry.type === "dieStep"), "Murciélago no duplica su mejora pasiva en el diálogo");
}

// Los implantes del compendio llegan instalados: el DJ decide si hace falta clínica o tirada.
{
  const modules = JSON.parse(await read("data/modules-content.json"));
  const implants = modules.packs.find(pack => pack.name === "cyber-implants").documents;
  assert.ok(implants.every(item => item.system.installed === true), "los implantes del compendio vienen instalados");
  const weapons = modules.packs.flatMap(pack => pack.documents).filter(item => item.type === "weapon");
  const armor = modules.packs.flatMap(pack => pack.documents).filter(item => item.type === "armor");
  assert.ok(weapons.every(item => (item.system.condition ?? "normal") === "normal"), "las armas de los módulos empiezan normales");
  assert.ok(armor.every(item => (item.system.pristine ?? false) === false), "las armaduras de los módulos no empiezan impolutas");
}
