/**
 * Writes every compendium (LevelDB) and updates system.json (packs, folders, types, version).
 *
 *   node tools/build-basic-content.mjs     # data/basic-content.json
 *   node tools/build-module-content.mjs    # data/modules-content.json
 *   node tools/build-packs.mjs
 *
 * Foundry must be closed (or the world not using the system) while packs are rewritten.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const CLASSIC_LEVEL = process.env.CLASSIC_LEVEL ?? "/home/javi/ExecApps/FoundryVTT/FoundryVTT/resources/app/node_modules/classic-level";
const { ClassicLevel } = require(CLASSIC_LEVEL);
const here = path.dirname(fileURLToPath(import.meta.url));
const systemRoot = path.resolve(here, "..");
const systemJsonPath = path.join(systemRoot, "system.json");
const systemJson = JSON.parse(fs.readFileSync(systemJsonPath, "utf8"));
const VERSION = systemJson.version;
const CORE = "13.348";
const basicContent = JSON.parse(fs.readFileSync(path.join(systemRoot, "data/basic-content.json"), "utf8"));
const moduleContent = JSON.parse(fs.readFileSync(path.join(systemRoot, "data/modules-content.json"), "utf8"));

const foundryId = (namespace, name) => crypto.createHash("sha256").update(`${namespace}:${name}`).digest("hex").slice(0, 16);

const IMAGE_ROOT = "systems/tdt/assets/icons";

function basicImage(item) {
  if (item.type === "feat") return `${IMAGE_ROOT}/${item.system.category === "disadvantage" ? "disadvantage" : "feat"}.svg`;
  if (item.type === "gear" && item.system.category === "vehicle") return `${IMAGE_ROOT}/vehicle.svg`;
  if (item.type === "gear" && item.system.category === "skillChip") return `${IMAGE_ROOT}/chip.svg`;
  return `${IMAGE_ROOT}/${item.type === "race" ? "race" : item.type || "gear"}.svg`;
}

function brandedImage(item) {
  const custom = item.img && !item.img.startsWith("icons/svg/");
  return custom ? item.img : basicImage(item);
}

function actorImage(actor) {
  if (actor.img && !actor.img.startsWith("icons/svg/")) return actor.img;
  if (actor.type === "mecha") return `${IMAGE_ROOT}/mecha.svg`;
  if (actor.type === "character") return `${IMAGE_ROOT}/character.svg`;
  if (actor.img?.includes("skull")) return `${IMAGE_ROOT}/zombie.svg`;
  if (actor.img?.includes("cowled")) return `${IMAGE_ROOT}/machine.svg`;
  return `${IMAGE_ROOT}/npc.svg`;
}

const stats = (packName, documentName, id) => ({
  coreVersion: CORE,
  systemId: "tdt",
  systemVersion: VERSION,
  compendiumSource: `Compendium.tdt.${packName}.${documentName}.${id}`
});

function itemDocument(item, packName, namespace = packName) {
  const id = foundryId(namespace, `${item.type}:${item.name}`);
  return {
    _id: id,
    name: item.name,
    type: item.type,
    img: brandedImage(item),
    system: item.system,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: { tdt: { content: true, module: item.system?.module ?? "" } },
    _stats: stats(packName, "Item", id)
  };
}

function actorDocument(actor, packName) {
  const id = foundryId(packName, actor.name);
  const items = (actor.items ?? []).map((item, index) => {
    const document = itemDocument(item, packName, `${packName}-${actor.name}-${index}`);
    delete document._stats.compendiumSource;
    return document;
  });
  const friendly = actor.type !== "npc";
  const img = actorImage(actor);
  return {
    _id: id,
    name: actor.name,
    type: actor.type,
    img,
    system: actor.system,
    items: items.map(item => item._id),
    _embeddedItems: items,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    prototypeToken: {
      name: actor.name,
      displayName: 20,
      actorLink: friendly,
      disposition: friendly ? 1 : -1,
      displayBars: 20,
      bar1: { attribute: "health" },
      bar2: { attribute: null },
      width: actor.type === "mecha" ? 2 : 1,
      height: actor.type === "mecha" ? 2 : 1,
      texture: { src: img, anchorX: 0.5, anchorY: 0.5, fit: "contain", scaleX: 1, scaleY: 1, rotation: 0, tint: "#ffffff", alphaThreshold: 0.75 }
    },
    flags: { tdt: { content: true } },
    _stats: stats(packName, "Actor", id)
  };
}

function tableDocument(table, packName) {
  const id = foundryId(packName, table.name);
  const results = table.results.map((result, index) => ({
    _id: foundryId(`${packName}-${table.name}`, String(index)),
    type: "text",
    name: result.text,
    description: result.text,
    img: "icons/svg/d20-black.svg",
    range: result.range,
    weight: 1,
    drawn: false,
    flags: {},
    _stats: { coreVersion: CORE, systemId: "tdt", systemVersion: VERSION }
  }));
  return {
    _id: id,
    name: table.name,
    img: "icons/svg/d20-grey.svg",
    description: table.description ?? "",
    formula: table.formula,
    replacement: true,
    displayRoll: true,
    results: results.map(result => result._id),
    _embeddedResults: results,
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: { tdt: { content: true } },
    _stats: stats(packName, "RollTable", id)
  };
}

async function writePack(name, documentName, documents) {
  const packPath = path.join(systemRoot, "packs", name);
  fs.mkdirSync(packPath, { recursive: true });
  const db = new ClassicLevel(packPath, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  await db.clear();
  const collection = { Actor: "actors", Item: "items", RollTable: "tables" }[documentName];
  const operations = [];
  const ids = new Set();
  for (const source of documents) {
    const document = { ...source };
    if (ids.has(document._id)) throw new Error(`Id duplicado en ${name}: ${document.name}`);
    ids.add(document._id);
    const embeddedItems = document._embeddedItems ?? [];
    const embeddedResults = document._embeddedResults ?? [];
    delete document._embeddedItems;
    delete document._embeddedResults;
    operations.push({ type: "put", key: `!${collection}!${document._id}`, value: document });
    for (const item of embeddedItems) operations.push({ type: "put", key: `!actors.items!${document._id}.${item._id}`, value: item });
    for (const result of embeddedResults) operations.push({ type: "put", key: `!tables.results!${document._id}.${result._id}`, value: result });
  }
  await db.batch(operations);
  await db.compactRange("\x00", "\xff");
  await db.close();
  console.log(`${name.padEnd(24)} ${String(documents.length).padStart(3)} ${documentName}`);
}

/* -------------------------------------------- */

const packDefinitions = [];
const define = (name, label, type, module, documents) => packDefinitions.push({ name, label, type, module, documents });

const basicItems = basicContent.items.map(item => ({ ...item, system: { ...item.system, module: "" } }));
define("basic-feats", "TDT · Dotes básicas", "Item", "", basicItems.filter(item => item.type === "feat"));
define("basic-weapons", "TDT · Armas específicas", "Item", "", basicItems.filter(item => item.type === "weapon"));
define("basic-armor", "TDT · Armaduras básicas", "Item", "", basicItems.filter(item => item.type === "armor"));
define("basic-gear", "TDT · Objetos y vehículos", "Item", "", basicItems.filter(item => item.type === "gear"));
define("basic-npcs", "TDT · PNJ básicos", "Actor", "", basicContent.actors);
for (const pack of moduleContent.packs) define(pack.name, pack.label, pack.type, pack.module, pack.documents);

for (const pack of packDefinitions) {
  const documents = pack.documents.map(document => {
    if (pack.type === "Actor") return actorDocument(document, pack.name);
    if (pack.type === "RollTable") return tableDocument(document, pack.name);
    return itemDocument(document, pack.name);
  });
  await writePack(pack.name, pack.type, documents);
}

/* -------------------------------------------- */
/*  system.json                                  */
/* -------------------------------------------- */

const folderNames = { "": "Two Dice Tales · Básico", fantasy: "TDT · Fantástico", mecha: "TDT · Mechas", powers: "TDT · Superpoderes", zombie: "TDT · Zombis", cyber: "TDT · Cyberpunk" };
const folderColors = { "": "#245c6b", fantasy: "#4b6b2a", mecha: "#55606e", powers: "#7a3a8c", zombie: "#6b4a2a", cyber: "#1d8a9c" };
const used = new Set(fs.readdirSync(path.join(systemRoot, "packs")));
for (const name of used) {
  if (!packDefinitions.some(pack => pack.name === name)) console.warn(`Aviso: packs/${name} ya no se genera (bórralo a mano si sobra).`);
}
systemJson.packs = packDefinitions.map(pack => ({
  name: pack.name,
  label: pack.label,
  path: `packs/${pack.name}`,
  type: pack.type,
  system: "tdt",
  ownership: { PLAYER: "OBSERVER", ASSISTANT: "OWNER" },
  flags: { tdt: { module: pack.module } }
}));
systemJson.packFolders = Object.entries(folderNames).map(([module, name], index) => ({
  name,
  sorting: "a",
  color: folderColors[module],
  packs: packDefinitions.filter(pack => pack.module === module).map(pack => pack.name),
  sort: index
}));
systemJson.documentTypes = {
  Actor: { character: {}, npc: {}, mecha: {} },
  Item: { feat: {}, weapon: {}, armor: {}, gear: {}, race: {}, spell: {}, power: {}, implant: {}, hack: {} }
};
systemJson.socket = true;
fs.writeFileSync(systemJsonPath, `${JSON.stringify(systemJson, null, 2)}\n`);
console.log(`system.json actualizado: ${systemJson.packs.length} compendios.`);
