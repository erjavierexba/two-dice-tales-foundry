/**
 * Reads the optional modules of the manual (read only) and writes data/modules-content.json,
 * which build-packs.mjs turns into compendiums.
 *
 *   node tools/build-module-content.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clean, oneLine, section, parseTable, headedBlocks, field, stripFields, parseFeats, costValue, costFormula,
  inferFeatRules, parseEnemies, parseEnemy, enemyWeapon
} from "./md-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const manual = path.resolve(here, "../../../PorPartes");
const read = file => fs.readFileSync(path.join(manual, file), "utf8").replace(/\r/g, "");
const basic = read("2 - Módulo básico.md");
const fantasyMd = read("modulos_opcionales/1 - Módulo fantástico.md");
const mechaMd = read("modulos_opcionales/2 - Módulo de mechas.md");
const powersMd = read("modulos_opcionales/3 - Módulo de superpoderes.md");
const zombieMd = read("modulos_opcionales/4 - Módulo de zombis.md");
const cyberMd = read("modulos_opcionales/5 - Módulo cyberpunk.md");
const basicContent = JSON.parse(fs.readFileSync(path.join(here, "../data/basic-content.json"), "utf8"));

const IMG = {
  feat: "icons/svg/upgrade.svg",
  disadvantage: "icons/svg/downgrade.svg",
  weapon: "icons/svg/sword.svg",
  armor: "icons/svg/shield.svg",
  gear: "icons/svg/item-bag.svg",
  vehicle: "icons/svg/wing.svg",
  race: "icons/svg/mystery-man.svg",
  spell: "icons/svg/explosion.svg",
  power: "icons/svg/lightning.svg",
  implant: "icons/svg/circuit.svg",
  hack: "icons/svg/daze.svg",
  chip: "icons/svg/card-hand.svg",
  npc: "icons/svg/mystery-man.svg",
  machine: "icons/svg/cowled.svg",
  zombie: "icons/svg/skull.svg",
  mecha: "icons/svg/castle.svg"
};

const rule = (type, value, scopes, label, extra = {}) => ({ type, value, scopes, label, ...extra });
const mod = (target, value) => ({ target, value });
const flag = name => mod(`flag.${name}`, 1);
const lower = text => text.toLocaleLowerCase("es");

/** Builds a feat item, applying the hand annotations by name. */
function featItem(feat, module, annotations = {}) {
  const note = annotations[feat.name] ?? annotations[lower(feat.name)] ?? {};
  const cost = costValue(feat.costText);
  const formula = costFormula(feat.costText);
  const description = feat.description || `${feat.name}.`;
  const rules = note.rules ?? inferFeatRules(feat.name, description);
  if (note.extraRules) rules.push(...note.extraRules);
  const system = {
    description: [feat.requirements ? `Requisitos: ${feat.requirements}.` : "", description].filter(Boolean).join("\n\n"),
    cost,
    costFormula: formula,
    requirements: feat.requirements,
    category: cost < 0 ? "disadvantage" : "advantage",
    tags: feat.tags,
    module,
    modifiers: note.modifiers ?? [],
    rules,
    ...(note.system ?? {})
  };
  return { name: note.name ?? feat.name, type: "feat", img: cost < 0 ? IMG.disadvantage : IMG.feat, system };
}

function incrementalFromTags(tags) {
  const tag = tags.find(entry => /^incremental/i.test(entry));
  if (!tag) return 0;
  return Number(tag.match(/(\d+)/)?.[1] ?? 2);
}

function sacrificeFromTags(tags) {
  const tag = tags.find(entry => /^sacrificio/i.test(entry));
  if (!tag) return 0;
  return Number(tag.match(/(\d+)/)?.[1] ?? 2);
}

const packs = [];
const addPack = (name, label, type, module, documents) => {
  if (!documents.length) throw new Error(`Pack vacío: ${name}`);
  packs.push({ name, label, type, module, documents });
};

/* ============================================ */
/*  Basic: generic and stationary weapons        */
/* ============================================ */

const genericRows = parseTable(section(basic, "#### Armas", "#### Opcional: armas específicas"), "Tipo de arma");
const genericWeapons = genericRows.map(([name, examples, attribute, properties]) => {
  const melee = /^(Cuerpo|Cac)/i.test(name);
  const ammo = /Munición/.test(properties) && !/Munición\s*\(/.test(properties) ? 10 : 0;
  return {
    name,
    type: "weapon",
    img: IMG.weapon,
    system: {
      description: `Plantilla genérica. Ejemplos: ${examples}. Característica: ${attribute}.${ammo ? " La munición por cargador la decide el DJ (10 por defecto)." : ""}`,
      damage: Number(properties.match(/Daño\s*(\d+)/)?.[1] ?? 0),
      skill: name.startsWith("Cuerpo") ? "brawl" : melee ? "melee" : "ranged",
      attribute: /^Destreza$/.test(attribute) ? "dexterity" : "power",
      range: melee ? "contact" : /explosivo lanzable/i.test(name) ? "short" : "medium",
      properties,
      ammo: { value: ammo, max: ammo },
      module: "",
      equipped: false,
      condition: "pristine"
    }
  };
});
const stationaryRows = parseTable(section(basic, "#### Armas estacionarias", "####  Armaduras"), "Tipo de arma");
const stationaryWeapons = stationaryRows.map(([name, properties]) => ({
  name,
  type: "weapon",
  img: IMG.weapon,
  system: {
    description: "Arma estacionaria: no se puede transportar; se usa desde su emplazamiento.",
    damage: Number(properties.match(/Daño\s*(\d+)/)?.[1] ?? 0),
    skill: "ranged",
    attribute: "dexterity",
    range: "long",
    properties,
    ammo: { value: 10, max: 10 },
    module: "",
    condition: "pristine"
  }
}));
addPack("basic-generic-weapons", "TDT · Armas genéricas y estacionarias", "Item", "", [...genericWeapons, ...stationaryWeapons]);

/* ============================================ */
/*  Fantasy                                      */
/* ============================================ */

const raceRows = parseTable(section(fantasyMd, "## Razas", "### Crear razas nuevas"), "Raza");
const raceAnnotations = {
  Humano: { modifiers: [mod("skillPoints", 5)] },
  Enano: {
    modifiers: [mod("health", 2), mod("step.defense.fortitude", 1)],
    rules: [rule("difficulty", -2, ["athletics"], "Enano: correr", { optional: true })]
  },
  Elfo: { modifiers: [mod("health", -2), mod("step.attribute.dexterity", 1)], uses: { value: 2, max: 2, per: "day", reroll: true } },
  Mediano: { uses: { value: 2, max: 2, per: "day", reroll: true } },
  Orco: { modifiers: [flag("orcSurvive")], uses: { value: 1, max: 1, per: "day", reroll: false } },
  Goblin: {},
  Gnomo: {}
};
const races = raceRows.map(([name, text]) => {
  const note = raceAnnotations[name] ?? {};
  return {
    name,
    type: "race",
    img: IMG.race,
    system: {
      description: text,
      module: "fantasy",
      modifiers: note.modifiers ?? [],
      rules: [rule("reminder", 0, [], name, { text }), ...(note.rules ?? [])],
      uses: note.uses ?? { value: 0, max: 0, per: "day", reroll: false }
    }
  };
});
addPack("fantasy-races", "TDT Fantástico · Razas", "Item", "fantasy", races);

const fantasyAnnotations = {
  "Proyectil mágico": { system: { attack: { enabled: true, damage: 3, range: "medium", defense: "evasion", area: false } } },
  "Cono de proyectil mágico": { system: { attack: { enabled: true, damage: 3, range: "short", defense: "evasion", area: true } } },
  Furia: {
    system: { toggle: true },
    rules: [rule("extraDie", 4, ["attack"], "Furia (añade 1d4 a los golpes)"), rule("reminder", 0, [], "Furia", { text: "Cuando un daño vaya a afectar a tus PV, añádele 1d4. No puedes usar dotes con Concentración." })]
  },
  Caza: { system: { toggle: true }, rules: [rule("dieStep", 1, ["attack"], "Caza (contra tu presa, una vez por turno)", { target: "second", optional: true })] },
  "Ataque rastrero": { rules: [rule("reminder", 0, ["attack"], "Ataque rastrero", { text: "Si el objetivo no se lo espera (DJ), añade 1d6 al daño si traspasa el aguante." })] },
  "Reserva mágica I": { modifiers: [mod("mana", 4)], rules: [] },
  "Reserva mágica II": { modifiers: [mod("mana", 5)], rules: [] },
  "Reserva mágica III": { modifiers: [mod("mana", 6)], rules: [] }
};
const fantasyFeatSources = [
  ...parseFeats(section(fantasyMd, "### Escalado de maná mediante dotes", "### Coste de símbolos raíz")),
  ...parseFeats(section(fantasyMd, "#### Ánima prestada", "### Combinaciones de símbolos")),
  ...parseFeats(section(fantasyMd, "### Dotes mágicas de acceso", "### Compatibilidad con dotes mágicas anteriores")),
  ...parseFeats(section(fantasyMd, "### Dotes mágicas sencillas", "## Dotes físicas")),
  ...parseFeats(section(fantasyMd, "## Dotes físicas"))
];
// Reserva mágica comes as a table.
for (const [name, cost, requirement, effect] of parseTable(section(fantasyMd, "#### Escalado de maná mediante dotes", "### Coste de símbolos raíz"), "Dote")) {
  fantasyFeatSources.push({ name, costText: cost, body: "", tags: ["Magia"], requirements: requirement, description: effect });
}
// Descriptions for the list feats (symbols and modifiers).
const symbolText = {
  elemental: "Te permite usar este símbolo elemental en tus círculos. Los arcanos y druidas pueden aprender estas dotes.",
  metaphysical: "Te permite usar este símbolo metafísico en tus círculos.",
  sacred: "Marca sacra para tus círculos. Los clérigos obtienen una gratis con Iniciado clérigo.",
  druidic: "Campo druídico para tus círculos. Los druidas obtienen uno gratis con Iniciado druídico."
};
const seen = new Set();
const fantasyFeats = [];
for (const feat of fantasyFeatSources) {
  if (seen.has(feat.name)) continue;
  seen.add(feat.name);
  if (!feat.description) {
    if (/^Símbolo elemental/.test(feat.name)) feat.description = symbolText.elemental;
    else if (/^Símbolo metafísico/.test(feat.name)) feat.description = symbolText.metaphysical;
    else if (/^Marca sacra/.test(feat.name)) feat.description = symbolText.sacred;
    else if (/^Campo druídico/.test(feat.name)) feat.description = symbolText.druidic;
  }
  const item = featItem(feat, "fantasy", fantasyAnnotations);
  const incremental = incrementalFromTags(feat.tags);
  const sacrifice = sacrificeFromTags(feat.tags);
  if (incremental) item.system.incremental = incremental;
  if (sacrifice) item.system.sacrifice = sacrifice;
  if (/^(Símbolo|Marca sacra|Campo druídico|Modificador:|Iniciado|Reserva mágica|Pozo interior|Magia interior|Magia heterodoxa)/.test(feat.name)) item.system.rules = item.system.rules.filter(entry => entry.type === "reminder");
  fantasyFeats.push(item);
}
for (const feat of parseFeats(section(fantasyMd, "### Dotes de símbolos elementales", "### Dotes de modificadores"))) {
  if (seen.has(feat.name)) continue;
  seen.add(feat.name);
  const family = /^Símbolo elemental/.test(feat.name) ? "elemental" : /^Símbolo metafísico/.test(feat.name) ? "metaphysical" : /^Marca sacra/.test(feat.name) ? "sacred" : "druidic";
  feat.description = symbolText[family];
  feat.tags = ["Magia"];
  const item = featItem(feat, "fantasy", fantasyAnnotations);
  item.system.rules = [];
  fantasyFeats.push(item);
}
fantasyFeats.push({
  name: "Símbolo metafísico: Magia",
  type: "feat",
  img: IMG.feat,
  system: { description: "Incluido en Iniciado arcano e Iniciado clérigo. Si otra tradición lo aprende, cuesta +2 y requiere permiso del DJ.", cost: 2, category: "advantage", tags: ["Magia"], module: "fantasy", modifiers: [], rules: [] }
});
for (const feat of parseFeats(section(fantasyMd, "### Dotes de modificadores", "### Dotes avanzadas opcionales"))) {
  if (seen.has(feat.name)) continue;
  seen.add(feat.name);
  const item = featItem(feat, "fantasy", fantasyAnnotations);
  item.system.rules = [];
  fantasyFeats.push(item);
}
for (const feat of parseFeats(section(fantasyMd, "### Dotes avanzadas opcionales", "### Compatibilidad con dotes mágicas anteriores"))) {
  if (seen.has(feat.name)) continue;
  seen.add(feat.name);
  fantasyFeats.push(featItem(feat, "fantasy", fantasyAnnotations));
}
addPack("fantasy-feats", "TDT Fantástico · Dotes", "Item", "fantasy", fantasyFeats);

const circleExamples = {
  "Proyectil mágico básico": { marks: [{ root: "magic", modifiers: ["reach", "form"] }], attack: true },
  "Proyectil mágico potenciado": { marks: [{ root: "magic", modifiers: ["reach", "form", "potency"] }], attack: true },
  "Proyectil de fuego": { marks: [{ root: "fire", modifiers: ["reach", "form"] }], attack: true },
  "Bola de fuego": { marks: [{ root: "fire", modifiers: ["reach", "area", "form", "potency"] }], attack: true },
  "Calor sin llama": { marks: [{ root: "fire", modifiers: ["property", "target"] }] },
  Invisibilidad: { marks: [{ root: "light", modifiers: ["target", "property", "negation", "duration"] }] },
  Hielo: { marks: [{ root: "water", modifiers: ["property", "form"] }, { root: "void", modifiers: ["negation"] }] },
  Magnetismo: { marks: [{ root: "earth", modifiers: ["property"] }, { root: "electricity", modifiers: ["target"] }] },
  Veneno: { marks: [{ root: "acid", modifiers: ["potency"] }, { root: "animal", modifiers: ["property", "duration"] }] }
};
const circles = headedBlocks(section(fantasyMd, "### Ejemplos de círculos", "### Dotes mágicas de acceso"), 4).map(block => {
  const data = circleExamples[block.title];
  if (!data) throw new Error(`Círculo sin anotar: ${block.title}`);
  return {
    name: block.title,
    type: "spell",
    img: IMG.spell,
    system: {
      description: clean(block.body),
      module: "fantasy",
      marks: data.marks.map(mark => ({ subtracted: false, extraPotency: 0, ...mark })),
      shared: [],
      attack: { enabled: Boolean(data.attack), extraPotency: 0, manyTargets: false, defense: "evasion" }
    }
  };
});
addPack("fantasy-circles", "TDT Fantástico · Círculos de ejemplo", "Item", "fantasy", circles);

/* ============================================ */
/*  Mechas                                       */
/* ============================================ */

const mechaAnnotations = {
  "¡Aprieta los dientes!": { modifiers: [flag("willLinkMelee")], rules: [] },
  "¡Armadura de voluntad!": { modifiers: [flag("willLinkDefense")], rules: [] },
  "Arma principal mejorada": { modifiers: [flag("primaryWeapon")], rules: [] },
  "Blindaje pesado": { modifiers: [mod("mecha.endurance", "2 + categoría"), mod("mecha.step.robustness", 1)], rules: [] },
  "Cámaras de detección con IA": { modifiers: [flag("aiCameras")], rules: [] },
  Mechasinapsis: { modifiers: [flag("mechasynapse")], rules: [] },
  "Propulsor aéreo": { modifiers: [flag("thruster"), flag("flying")], rules: [] },
  "Propulsor terrestre": { modifiers: [flag("thruster")], rules: [rule("dieStep", 1, ["maneuver"], "Propulsor terrestre (en tierra)", { target: "second" })] },
  "Soporte aéreo": { modifiers: [flag("airSupport")], rules: [] },
  "Sistema de armas inestable": { modifiers: [flag("unstableWeapons")], rules: [] },
  "Módulo de captación de munición fallida": { modifiers: [flag("ammoFeedFailure")], rules: [] },
  "Blindaje frágil": { modifiers: [mod("mecha.endurance", "-(2 + categoría)"), mod("mecha.step.robustness", -1)], rules: [] },
  "Nudillos de doble tonelaje": { rules: [rule("reminder", 0, ["mecha-attack"], "Nudillos de doble tonelaje", { text: "Con los nudillos metálicos: ignoran 3 puntos más de aguante y su dado pasa a d6." })] },
  "Motor del tren inferior imparable": { rules: [rule("penalty", 1, ["ranged-attack"], "Motor imparable (ataques a distancia)")] }
};
const mechaFeats = parseFeats(section(mechaMd, "### Dotes positivas", "## Compendio")).map(feat => {
  const item = featItem(feat, "mecha", mechaAnnotations);
  // Positive feats spend inventory points, negative ones give them back.
  item.system.inventoryCost = costFormula(feat.costText) || String(costValue(feat.costText));
  item.system.description = `Coste en puntos de inventario: ${feat.costText}.\n\n${item.system.description}`;
  return item;
});
addPack("mecha-feats", "TDT Mechas · Dotes", "Item", "mecha", mechaFeats);

const mechaModuleKey = text => (/MAE/.test(text) ? "special" : /MB/.test(text) ? "blaster" : "melee");
const mechaSkillKey = text => (/puntería/i.test(text) ? "ranged" : /combate con armas/i.test(text) && !/maniobra/i.test(text) ? "melee" : "brawl");
const rangeKey = text => {
  const t = lower(text);
  if (t.includes("muy corta") || t.includes("muy corto")) return "veryShort";
  if (t.includes("muy larga") || t.includes("muy largo")) return "veryLong";
  if (t.includes("media-larga") || t.includes("medio-larga")) return "mediumLong";
  if (t.includes("extrema")) return "extreme";
  if (t.includes("larga") || t.includes("largo")) return "long";
  if (t.includes("media") || t.includes("medio")) return "medium";
  if (t.includes("corta") || t.includes("corto")) return "short";
  return "contact";
};
const mechaWeaponRows = parseTable(section(mechaMd, "### Armas", "### Propiedades nuevas"), "Tipo de arma").filter(row => row[1] || row[2]);
const mechaWeapons = mechaWeaponRows.map(([name, cost, attack, range, properties]) => {
  const ammo = Number(properties.match(/(?:Munición|Batería)\s*\(?\s*(\d+)/i)?.[1] ?? 0);
  return {
    name: name.replace(/\s*\(base\)/, ""),
    type: "weapon",
    img: IMG.weapon,
    system: {
      description: `Arma de mecha. Tirada: ${attack}. Puntos de inventario: ${cost}. El Daño indicado es el de categoría 1 y sube 2 por categoría (o el valor de Tamaño).`,
      damage: Number(properties.match(/Daño\s*(\d+)/i)?.[1] ?? 0),
      skill: mechaSkillKey(attack),
      attribute: "dexterity",
      range: rangeKey(range),
      properties,
      ammo: { value: ammo, max: ammo },
      module: "mecha",
      equipped: true,
      mecha: { enabled: true, primary: false, module: mechaModuleKey(attack), category: 1, size: 0, inventoryCost: cost.replace(/\s*x\s*/g, " x "), integrated: !/\bMano\b/.test(properties) }
    }
  };
});
addPack("mecha-weapons", "TDT Mechas · Armas", "Item", "mecha", mechaWeapons);

const mechaInventory = parseTable(section(mechaMd, "### Inventario", "### Listado de enemigos"), "Objeto")
  .filter(row => row[1])
  .map(([name, cost, description]) => ({
    name: name.trim(),
    type: "gear",
    img: IMG.gear,
    system: {
      description: `Puntos de inventario: ${cost}. ${description}`,
      category: "mecha",
      module: "mecha",
      inventoryCost: cost.replace(/^2\s*categoría$/, "2 x categoría"),
      quantity: 1,
      equipped: true,
      uses: /Kit de reparación/.test(name) ? { value: 4, max: 4, per: "session", reroll: false } : { value: 0, max: 0, per: "day", reroll: false }
    }
  }));
addPack("mecha-inventory", "TDT Mechas · Inventario", "Item", "mecha", mechaInventory);

const mechaEnemies = parseEnemies(section(mechaMd, "### Listado de enemigos", "## Regla opcional"), 5, () => ({ machine: true }));
for (const enemy of mechaEnemies) {
  enemy.img = IMG.mecha;
  for (const item of enemy.items) item.system.module = "mecha";
}
addPack("mecha-enemies", "TDT Mechas · Enemigos", "Actor", "mecha", mechaEnemies);

const pickByName = (list, name) => {
  const found = list.find(item => lower(item.name) === lower(name)) ?? list.find(item => lower(item.name).startsWith(lower(name)));
  if (!found) throw new Error(`No encontrado: ${name}`);
  return structuredClone(found);
};
const mechaExample = (name, category, { feats, weapons, gear, modules }) => ({
  name,
  type: "mecha",
  img: IMG.mecha,
  system: {
    category,
    health: { value: 15 + (category - 1) * 5, max: 15 + (category - 1) * 5 },
    modules,
    description: `Ejemplo del módulo de mechas (categoría ${category}). Asigna un piloto arrastrando su personaje a la ficha.`
  },
  items: [
    ...feats.map(feat => pickByName(mechaFeats, feat)),
    ...weapons.map(weapon => pickByName(mechaWeapons, weapon)),
    ...gear.map(([entry, quantity]) => {
      const item = pickByName(mechaInventory, entry);
      item.system.quantity = quantity;
      return item;
    })
  ]
});
const mechaExamples = [
  mechaExample("G4-Sentinel 21", 1, {
    feats: ["Puesto: Explorador", "Propulsor aéreo", "Focos", "Escáner", "Visión nocturna", "Cámaras de detección con IA"],
    weapons: ["Nudillos metálicos", "Motosierra", "Ametralladora ligera"],
    gear: [["Dron canino", 1], ["Batería adicional", 1], ["Caja de munición", 1], ["Suministros de emergencia", 1]],
    modules: { melee: 8, blaster: 4, special: 4 }
  }),
  mechaExample("M0Th3rB4S3", 4, {
    feats: ["Puesto: Suministrador", "Puesto: Técnico", "Blindaje pesado", "Focos", "Escáner", "Visión nocturna", "Cámaras de detección con IA", "Carguero", "Copiloto", "Sudo su"],
    weapons: ["Nudillos metálicos", "Ametralladora pesada"],
    gear: [["Dron Volador", 1], ["Batería adicional", 6], ["Caja de munición", 6], ["Suministros de emergencia", 8], ["Escudo antibalístico", 2], ["Escudo de energía", 2], ["Kit de reparación", 3], ["Suministros armamentísticos", 2]],
    modules: { melee: 4, blaster: 6, special: 4 }
  })
];
const mechaPilots = [
  ["Yuki Takamiya", { power: 6, dexterity: 8, mind: 4, social: 4 }, { brawl: 6, melee: 8, ranged: 6, athletics: 4 }],
  ["Akemi", { power: 4, dexterity: 4, mind: 8, social: 6 }, { science: 10, athletics: 4, brawl: 4, melee: 4, ranged: 6 }],
  ["Haruna", { power: 6, dexterity: 8, mind: 4, social: 4 }, { brawl: 6, melee: 8, ranged: 6, athletics: 4 }]
].map(([name, attributes, skills]) => characterActor(name, { attributes, skills, description: "Piloto de ejemplo del módulo de mechas (solo con las estadísticas necesarias para el módulo)." }));
addPack("mecha-examples", "TDT Mechas · Mechas y pilotos de ejemplo", "Actor", "mecha", [...mechaExamples, ...mechaPilots]);

/* ============================================ */
/*  Superpowers                                  */
/* ============================================ */

const powersBlock = section(powersMd, "### Listado de poderes por ramas", "### Listado de enemigos");
const powerAnnotations = {
  "Chica mágica": { permanent: true, modifiers: [mod("energy", 5)] },
  Endurecimiento: { modifiers: [mod("energy", -5), mod("endurance", 4)] },
  "Cuerpo completo": { modifiers: [mod("energy", -5)] },
  "Cuerpo de goma": { rules: [rule("bonus", 1, ["evasion"], "Cuerpo de goma (gastando energía; Sobrecarga 2: bonifica 2)", { optional: true })] },
  "Absorción ígnea": { permanent: true },
  "Control piromántico": { permanent: true },
  "Vuelo incandescente": { permanent: true }
};
const powers = [];
const branchBlocks = headedBlocks(powersBlock, 4);
for (const branchBlock of branchBlocks) {
  for (const power of headedBlocks(branchBlock.body, 5)) {
    const match = power.title.match(/^(.+?)\s*\(Energía:\s*([^)]+)\)$/);
    if (!match) continue;
    const name = oneLine(match[1]);
    const energyText = lower(match[2]);
    const tags = field(power.body, "Etiquetas").split(",").map(tag => tag.trim()).filter(Boolean);
    const complexity = /avanzad/i.test(field(power.body, "Complejidad")) ? "complex" : "simple";
    const requirements = field(power.body, "Requiere", "Requisitos?").replace(/\*\*/g, "");
    const description = stripFields(power.body, ["Complejidad", "Etiquetas", "Requiere", "Requisitos?"]);
    const attackMatch = description.match(/rango\s+(muy corto|corto|medio-largo|medio|largo|muy largo|contacto)[^.]*?Daño\s*(\d+)/i);
    const note = powerAnnotations[name] ?? {};
    const overload = Number(tags.find(tag => /^Sobrecarga/i.test(tag))?.match(/(\d+)/)?.[1] ?? 0);
    powers.push({
      name,
      type: "power",
      img: IMG.power,
      system: {
        description,
        module: "powers",
        branch: branchBlock.title,
        complexity,
        energyCost: Number(energyText.match(/\d+/)?.[0] ?? 0),
        variableCost: /var[ií]a/.test(energyText),
        permanent: /permanente/.test(energyText) || Boolean(note.permanent),
        overload,
        cursed: tags.some(tag => /maldito/i.test(tag)),
        requirements,
        attack: attackMatch ? { enabled: true, damage: Number(attackMatch[2]), range: rangeKey(attackMatch[1]), defense: "evasion", overloadDamage: true } : { enabled: false, damage: 0, range: "medium", defense: "evasion", overloadDamage: true },
        modifiers: note.modifiers ?? [],
        rules: note.rules ?? []
      }
    });
  }
}
addPack("powers-powers", "TDT Superpoderes · Poderes", "Item", "powers", powers);
const powerEnemies = parseEnemies(section(powersMd, "### Listado de enemigos"), 5, name => ({ machine: /robot|excavadora|nave/i.test(name) }));
for (const enemy of powerEnemies) enemy.img = enemy.system.npcStats.machine ? IMG.machine : IMG.npc;
addPack("powers-enemies", "TDT Superpoderes · Enemigos", "Actor", "powers", powerEnemies);

/* ============================================ */
/*  Zombies                                      */
/* ============================================ */

const zombieAnnotations = {
  "Anticuerpos Z": { modifiers: [flag("antibodiesZ")], rules: [] },
  "Anticuerpos horribles": { modifiers: [flag("antibodiesHorrible")], rules: [] },
  "Ahorrador en materiales": { modifiers: [flag("materialSaver")], rules: [] },
  "Reciclando balas": { modifiers: [flag("bulletRecycler")], rules: [] },
  "Reparador de armas": { modifiers: [flag("weaponSaver")], rules: [] },
  "Destructor de armas": { modifiers: [flag("weaponBreaker")], rules: [] },
  "Constructor antizombies": { modifiers: [flag("antiZombieBuilder")], rules: [] },
  "Buscador avezado": { modifiers: [flag("seasonedSearcher")], rules: [] },
  "Resistente a la hambruna": { modifiers: [flag("hungerResistant")], rules: [] },
  "Repartir daño": { modifiers: [flag("splitDamage")], rules: [] },
  "Metabolismo eficiente": { modifiers: [mod("foodNeed", -2)], rules: [] },
  "Glotón": { modifiers: [mod("foodNeed", 2)], rules: [] },
  "Escándaloso/a": { rules: [rule("penalty", 1, ["stealth"], "Escandaloso/a")] },
  "Sigilo zombie": { rules: [rule("bonus", 1, ["stealth"], "Sigilo zombie (contra zombis)", { optional: true })] },
  "Sigilo zombie supremo": { rules: [rule("bonus", 3, ["stealth"], "Sigilo zombie supremo (contra zombis)", { optional: true })] },
  "Miedo por los zombies": { rules: [rule("penalty", 3, ["attack"], "Miedo por los zombis (primer ataque del combate contra un zombi)", { optional: true })] },
  "Venganza sobre este mundo podrido": { rules: [rule("bonus", 2, [], "Venganza (murió una persona querida; 1 si fue zombificada)", { optional: true })] },
  Bandido: { rules: [rule("bonus", 1, ["stealth", "intimidation", "deception"], "Bandido (contra otros supervivientes)", { optional: true })] },
  "Ser como tu madre buscando cosas": { rules: [rule("bonus", 3, ["investigation", "perception", "survival"], "Ser como tu madre (buscar recompensas, una vez al día)", { optional: true })] },
  "Piel dura": { rules: [rule("reminder", 0, [], "Piel dura", { text: "Aguante +1 contra ataques de ácido." })] },
  "Piel fina": { rules: [rule("reminder", 0, [], "Piel fina", { text: "Aguante −1 contra ataques de ácido." })] }
};
const zombieFeats = parseFeats(section(zombieMd, "## Dotes del módulo zombie", "## Compendio de zombies")).map(feat => featItem(feat, "zombie", zombieAnnotations));
addPack("zombie-feats", "TDT Zombis · Dotes", "Item", "zombie", zombieFeats);

const zombieGear = [
  { name: "Zombix", type: "gear", img: IMG.gear, system: { description: "El raro medicamento que pausa la zombificación un día: ese día no se hace la tirada. Úsalo desde la ficha para aplicarlo.", category: "consumable", module: "zombie", quantity: 1 } },
  { name: "Antizombix", type: "gear", img: IMG.gear, system: { description: "El ultra raro medicamento que reduce la zombificación en 1 (como mínimo 1). Úsalo desde la ficha para aplicarlo.", category: "consumable", module: "zombie", quantity: 1 } },
  { name: "Botiquín (5 cargas)", type: "gear", img: IMG.gear, system: { description: "Necesario para primeros auxilios. En este módulo solo tiene 5 cargas.", category: "misc", module: "zombie", quantity: 1, uses: { value: 5, max: 5, per: "session", reroll: false } } },
  { name: "Kit de reparación / herramientas improvisadas", type: "gear", img: IMG.gear, system: { description: "Permite reparar o fabricar sin penalizador.", category: "misc", module: "zombie", quantity: 1 } }
];
addPack("zombie-gear", "TDT Zombis · Objetos", "Item", "zombie", zombieGear);

const zombies = parseEnemies(section(zombieMd, "## Compendio de zombies"), 5);
for (const zombie of zombies) {
  zombie.img = IMG.zombie;
  zombie.system.npcStats.group = 1;
}
const basicZombie = zombies.find(zombie => zombie.name === "Zombie básico");
if (basicZombie) {
  const group = structuredClone(basicZombie);
  group.name = "Grupo de zombies básicos (4)";
  group.system.health = { value: 20, max: 20 };
  group.system.npcStats.group = 4;
  group.system.npcStats.traits = `Grupo de 2 a 6 zombies básicos: cambia el número del grupo y ajusta la vida (5 por zombi). ${basicZombie.system.npcStats.traits}`;
  zombies.push(group);
}
addPack("zombie-enemies", "TDT Zombis · Zombies", "Actor", "zombie", zombies);

const rewardRows = parseTable(section(zombieMd, "### **Recompensas**", "### Deterioro de armas"), "Recompensa");
addPack("zombie-tables", "TDT Zombis · Tablas", "RollTable", "zombie", [{
  name: "Recompensas (zombis)",
  formula: "1d20",
  description: "Tabla de recompensas del módulo de zombis.",
  results: rewardRows.map(([value, text]) => ({ range: [Number(value), Number(value)], text }))
}]);

/* ============================================ */
/*  Cyberpunk                                    */
/* ============================================ */

const AFIN = { modifiers: [mod("cc", 5)], rules: [] };
const cyberAnnotations = {
  "Afín a lo cromado: básica": AFIN,
  "Afín a lo cromado: avanzada": AFIN,
  "Afín a lo cromado: experta": AFIN,
  "Afín a lo cromado: legendaria": AFIN,
  "Rechazo inmunológico": { modifiers: [mod("cc", -5)], rules: [] },
  Animal: { modifiers: [flag("animal")], rules: [rule("dieStep", -1, ["diplomacy"], "Animal (contra quien sepa lo que eres)", { target: "second", optional: true })] },
  "Antecedentes penales": { rules: [rule("dieStep", -1, ["diplomacy"], "Antecedentes penales (policía o seguridad que te ha leído la nuca)", { target: "second", optional: true })] },
  "Chip pirata": { modifiers: [flag("pirateChip")], rules: [] },
  "Cabeza fría": { rules: [rule("bonus", 2, ["excess"], "Cabeza fría")] },
  Chatarrero: { modifiers: [flag("scrapper")], rules: [] },
  "Fantasma en la red": { modifiers: [flag("netGhost")], rules: [] },
  "Mano de cirujano": { rules: [rule("difficulty", 2, ["implant-surgery"], "Mano de cirujano")] },
  "Ojo para el cromo": { rules: [rule("bonus", 2, ["perception"], "Ojo para el cromo (descubrir implantes y armas ocultas)", { optional: true })] },
  Overclocking: { modifiers: [flag("overclocking")], rules: [] },
  Buscavidas: { rules: [rule("bonus", 2, ["society"], "Buscavidas (mercado negro, clínicas y encargos)", { optional: true })] },
  "Piloto de fuga": { rules: [rule("bonus", 2, [], "Piloto de fuga (conducir para escapar o perder a alguien)", { optional: true })] }
};
const cyberFeats = parseFeats(section(cyberMd, "## Dotes del módulo cyberpunk", "## Hacking")).map(feat => featItem(feat, "cyber", cyberAnnotations));
addPack("cyber-feats", "TDT Cyberpunk · Dotes", "Item", "cyber", cyberFeats);

const hackDefenseKey = text => ({ esquiva: "evasion", fortaleza: "fortitude", voluntad: "will", hacking: "hacking", dj: "gm", ninguna: "none" }[lower(text)] ?? "evasion");
const hackPrice = requirement => (requirement >= 8 ? 10000 : requirement >= 6 ? 5000 : 2000);
const hacks = headedBlocks(section(cyberMd, "### Listado de hacks", "## Implantes"), 4).map(block => {
  const requirement = Number(field(block.body, "Requisitos?").match(/d(\d+)/)?.[1] ?? 0);
  const defense = hackDefenseKey(field(block.body, "Defensa"));
  const properties = field(block.body, "Propiedades");
  const description = stripFields(block.body, ["Requisitos?", "Defensa", "Propiedades"]);
  return {
    name: block.title,
    type: "hack",
    img: IMG.hack,
    system: {
      description,
      module: "cyber",
      defense,
      requirement,
      damage: Number(properties.match(/Daño\s*(\d+)/)?.[1] ?? 0),
      properties,
      loaded: false,
      wired: /Cableado/i.test(properties),
      device: /Dispositivo/i.test(properties),
      implantsOnly: /Implantes/i.test(properties),
      neuralOverload: /Sobrecarga neural/i.test(properties),
      duration: properties.match(/Duración\s*\(([^)]+)\)/i)?.[1] ?? "",
      area: /Área/i.test(properties),
      singleAttack: /Ataque único/i.test(properties),
      nonLethal: /No letal/i.test(description),
      machineEnduranceZero: /Chispazo intravenoso/i.test(block.title),
      ignoreHumanEndurance: /Sobrecalentamiento/i.test(block.title),
      price: hackPrice(requirement)
    }
  };
});
addPack("cyber-hacks", "TDT Cyberpunk · Hacks", "Item", "cyber", hacks);

const tierFromCost = cost => (cost >= 10 ? "extreme" : cost >= 7 ? "major" : cost >= 4 ? "moderate" : "minor");
const upgrade = (name, cc, description, extra = {}) => ({ name, key: lower(name), cc, installed: false, description, modifiers: [], rules: [], ...extra });
const upgradeTables = {
  "Brazo robótico": "#### Mejoras del brazo robótico",
  "Ojos cibernéticos": "#### Mejoras de los ojos cibernéticos",
  Exoesqueleto: "#### Mejoras del exoesqueleto",
  "Piernas cibernéticas": "#### Mejoras de las piernas cibernéticas",
  "Médula ósea acelerada": "#### Mejoras de la médula ósea acelerada",
  "Compresores pulmonares": "#### Mejoras de los compresores pulmonares",
  "Oído de alto rango": "#### Mejoras del oído de alto rango"
};
const upgradeAnnotations = {
  "Manos de hacker": { modifiers: [flag("hackerHands")] },
  "Brazo de titanio": { rules: [rule("difficulty", 2, ["athletics", "brawl"], "Brazo de titanio (aplicar fuerza)", { optional: true }), rule("damage", 2, ["unarmed"], "Brazo de titanio (puñetazo)", { optional: true })] },
  "Exoesqueleto interno": { modifiers: [mod("armor", -2), mod("endurance", 2)] },
  Servomotores: { modifiers: [flag("servomotors")] },
  "Zoom óptico": { rules: [rule("bonus", 2, ["perception"], "Zoom óptico (ver a distancia larga o más)", { optional: true })] },
  "Sincronización ojo-arma": { modifiers: [flag("eyeWeaponSync")] },
  "Amortiguadores reforzados": { modifiers: [flag("legsReinforced")] },
  "Muelles de salto": { rules: [rule("bonus", 2, ["athletics"], "Muelles de salto (saltar)", { optional: true })] },
  "Médula de alto rendimiento": { modifiers: [flag("marrowHigh")] },
  "Filtro tóxico": { rules: [rule("bonus", 2, ["fortitude"], "Filtro tóxico (gases y venenos inhalados)", { optional: true })] },
  "Filtro de ruido": { modifiers: [flag("noiseFilter")] },
  "Coagulante sintético": { modifiers: [flag("noBleeding")] }
};
const implantAnnotations = {
  "AVS (Advanced VirtualSelf)": {
    name: "AVS (Advanced VirtualSelf)",
    upgrades: [
      upgrade("Cableado", 1, "Cable retráctil desde el puerto NSB: conexión física con dispositivos, terminales y nucas."),
      upgrade("Extrafirewall", 2, "Bonifica en 1 tus tiradas para defenderte de cualquier intento de hackearte."),
      upgrade("Antena de larga frecuencia", 2, "El alcance de tus hacks inalámbricos pasa a ser larga.")
    ],
    description: "Ranuras: cambia el número de ranuras (1–5) en la ficha del implante; la segunda cuesta 1 CC y cada una de las siguientes 2 CC."
  },
  "Brazo robótico": {
    modifiers: [flag("roboticArm")],
    rules: [
      rule("difficulty", 2, ["athletics", "brawl"], "Brazo robótico (aplicar fuerza o agarrar)", { optional: true }),
      rule("damage", 2, ["unarmed"], "Brazo robótico (puñetazo con este brazo)", { optional: true })
    ],
    exclusive: true
  },
  Exoesqueleto: { modifiers: [mod("armor", 2)] },
  "Piernas cibernéticas": { modifiers: [flag("legs")], rules: [rule("bonus", 1, ["athletics"], "Piernas cibernéticas (correr)", { optional: true })] },
  "Médula ósea acelerada": { modifiers: [flag("marrow"), flag("marrowDeath")] },
  "Oído de alto rango": { rules: [rule("bonus", 2, ["perception"], "Oído de alto rango (Percepción auditiva)", { optional: true })] }
};
const implants = headedBlocks(section(cyberMd, "## Implantes", "### Mejoras de implantes"), 4).map(block => {
  const ccText = field(block.body, "Coste de CC");
  const cc = Number(ccText.match(/\d+/)?.[0] ?? 0);
  const note = implantAnnotations[block.title] ?? {};
  const description = [stripFields(block.body, ["Coste de CC"]), note.description].filter(Boolean).join("\n\n");
  let upgrades = note.upgrades ?? [];
  const tableHeading = upgradeTables[block.title];
  if (tableHeading) {
    const rows = parseTable(section(cyberMd, tableHeading, "####"), "Mejora");
    upgrades = rows.map(([name, ccCost, effect]) => upgrade(name, Number(ccCost.match(/\d+/)?.[0] ?? 0), effect, upgradeAnnotations[name] ?? {}));
  }
  return {
    name: block.title,
    type: "implant",
    img: IMG.implant,
    system: {
      description: `Coste de CC: ${ccText}.\n\n${description}`,
      module: "cyber",
      cc,
      tier: tierFromCost(cc),
      installed: false,
      upgrades,
      exclusiveUpgrades: Boolean(note.exclusive),
      slots: 1,
      modifiers: note.modifiers ?? [],
      rules: note.rules ?? [],
      price: cc * 5000
    }
  };
});
const supremeKinds = { "Frontera IPv6": ["ipv6", ""], "Aceleración Neuronal Suprema (ANS)": ["ans", "2d6"], "Simulador Avanzado en Tiempo Real (SATR)": ["satr", "1d6"], "Copia de seguridad": ["backup", "2d6"] };
for (const block of headedBlocks(section(cyberMd, "### Implantes supremos", "## Armas"), 4)) {
  const [kind, costDice] = supremeKinds[block.title] ?? ["", ""];
  implants.push({
    name: block.title,
    type: "implant",
    img: IMG.implant,
    system: {
      description: clean(block.body),
      module: "cyber",
      cc: 0,
      tier: "supreme",
      installed: false,
      upgrades: [],
      supreme: { enabled: true, costDice, used: false, kind },
      modifiers: [],
      rules: [],
      price: 0
    }
  });
}
addPack("cyber-implants", "TDT Cyberpunk · Implantes", "Item", "cyber", implants);

const priceRows = Object.fromEntries([
  ...parseTable(section(cyberMd, "### Armas\n\n| Arma | Precio", "### Armaduras\n\n| Armadura | Precio"), "Precio"),
  ...parseTable(section(cyberMd, "### Armaduras\n\n| Armadura | Precio", "### Implantes\n"), "Precio"),
  ...parseTable(section(cyberMd, "### Hacking y objetos", "### Vehículos\n\n| Vehículo | Precio"), "Precio"),
  ...parseTable(section(cyberMd, "### Vehículos\n\n| Vehículo | Precio", "### Materiales\n\n| Material"), "Precio")
].map(([name, price]) => [lower(name).replace(/\s*\(.*\)$/, ""), Number(price.replace(/[^\d]/g, "")) || 0]));
const priceOf = name => priceRows[lower(name).replace(/\s*\(.*\)$/, "")] ?? 0;
const specialFor = {
  Pistola: "firstShot", Revólver: "lastChamber", Subfusil: "leadRain", "Fusil de asalto": "suppression",
  Escopeta: "highPower", Ametralladora: "suppression", Francotirador: "hawkEye", Lanzacohetes: "heatSeeking"
};
specialFor.Ametralladora = "tripod";
const specialRows = Object.fromEntries(parseTable(section(cyberMd, "#### Mejoras especiales", "## Armaduras"), "Mejora").map(([weapon, name, effect]) => [weapon, `${name}: ${effect}`]));
const firearms = parseTable(section(cyberMd, "### Armas de fuego", "### Armas cuerpo a cuerpo"), "Arma").map(([name, attribute, properties]) => {
  const ammo = Number(properties.match(/Munición\s*\((\d+)\)/)?.[1] ?? 0);
  return {
    name,
    type: "weapon",
    img: IMG.weapon,
    system: {
      description: `Arma de fuego. Mejora general: Inteligente o Bruta. Mejora especial disponible: ${specialRows[name] ?? "—"}`,
      damage: Number(properties.match(/Daño\s*(\d+)/)?.[1] ?? 0),
      skill: "ranged",
      attribute: "dexterity",
      range: /Francotirador/.test(name) ? "long" : /Escopeta|Pistola|Revólver|Subfusil/.test(name) ? "medium" : "mediumLong",
      properties,
      ammo: { value: ammo, max: ammo },
      module: "cyber",
      condition: "pristine",
      upgrades: { basic: [], general: "", special: "", specialEnabled: false, available: specialFor[name] ?? "" },
      price: priceOf(name)
    }
  };
});
const meleeWeapons = parseTable(section(cyberMd, "### Armas cuerpo a cuerpo", "**·Aturdidora"), "Arma").map(([name, kind, attribute, properties]) => ({
  name: name.replace(/\s*\/\s*/, " / "),
  type: "weapon",
  img: IMG.weapon,
  system: {
    description: `${kind}. Mejora general: Pesada o Residual.`,
    damage: Number(properties.match(/Daño\s*(\d+)/)?.[1] ?? 0),
    skill: "melee",
    attribute: /^Destreza$/.test(attribute) ? "dexterity" : "power",
    range: "contact",
    properties,
    ammo: { value: 0, max: 0 },
    module: "cyber",
    condition: "pristine",
    upgrades: { basic: [], general: "", special: "", specialEnabled: false },
    price: priceOf(name)
  }
}));
addPack("cyber-weapons", "TDT Cyberpunk · Armas", "Item", "cyber", [...firearms, ...meleeWeapons]);

const cyberArmor = parseTable(section(cyberMd, "## Armaduras", "## Objetos"), "Armadura").map(([name, kind, endurance, penalty, power, special]) => ({
  name,
  type: "armor",
  img: IMG.armor,
  system: {
    description: `${kind}. ${special === "—" ? "" : special}`.trim(),
    endurance: Number(endurance),
    evasionPenalty: Math.abs(Number(penalty) || 0),
    powerRequired: Number(power.match(/d(\d+)/)?.[1] ?? 0),
    shotEndurance: Number(special.match(/Aguante\s*(\d+)\s*contra disparos/i)?.[1] ?? 0),
    pristine: true,
    damage: 0,
    noStun: /aturdirte/i.test(special),
    module: "cyber",
    price: priceOf(name)
  }
}));
addPack("cyber-armor", "TDT Cyberpunk · Armaduras", "Item", "cyber", cyberArmor);

const cyberObjects = parseTable(section(cyberMd, "## Objetos", "## Construcción"), "Objeto").map(([name, description]) => ({
  name,
  type: "gear",
  img: IMG.gear,
  system: {
    description,
    category: /Terminal externo/.test(name) ? "terminal" : /Granada/.test(name) ? "consumable" : "misc",
    module: "cyber",
    quantity: 1,
    price: /^Chip de hack$/.test(name) ? 2000 : priceOf(name)
  }
}));
const chips = [
  ["Chip de habilidad", 4000, "Sube un paso el dado de una habilidad mientras está cargado (sin habilidad: d4; con d12: bonifica 1). Elige la habilidad en la ficha del chip."],
  ["Chip de habilidad de combate", 8000, "Chip de Puntería, Combate con armas cac, Maniobra de lucha o Hacking. Elige la habilidad en la ficha del chip."],
  ["Chip de defensa", 12000, "Sube un paso Esquiva, Fortaleza o Voluntad mientras está cargado. Elige la defensa en la ficha del chip."]
].map(([name, price, description]) => ({ name, type: "gear", img: IMG.chip, system: { description: `${description} Ocupa una ranura del AVS, pero no cuenta para los usos de hacks. Cargarlo en combate gasta el turno entero.`, category: "skillChip", chipTarget: "", loaded: false, module: "cyber", quantity: 1, price } }));
const vehicles = parseTable(section(cyberMd, "## Vehículos", "**·Analógico"), "Vehículo").map(([name, drive, passengers, driving, health, endurance, special]) => ({
  name,
  type: "gear",
  img: IMG.vehicle,
  system: {
    description: `Vehículo (Conducir: ${drive}). Pasajeros: ${passengers}. Conducción: ${driving}. PV: ${health}. Aguante: ${endurance}. ${special === "—" ? "" : special}`.trim(),
    category: "vehicle",
    module: "cyber",
    quantity: 1,
    price: priceOf(name)
  }
}));
const cyberGear = [...cyberObjects, ...chips, ...vehicles];
addPack("cyber-gear", "TDT Cyberpunk · Objetos, chips y vehículos", "Item", "cyber", cyberGear);

const cyberNpcExtras = (name, body) => {
  const traits = lower(body);
  return {
    machine: /^(Dron|Torreta|Robot)/.test(name),
    noVirtualSelf: name === "Animal",
    implants: /implante|brazo robótico|exoesqueleto|ojos cibernéticos|cromado|exceso/.test(traits) || name === "Desalineado",
    excess: Number(body.match(/tiene (\d+) de exceso/)?.[1] ?? 0)
  };
};
const cyberNpcs = parseEnemies(section(cyberMd, "## Compendio"), 4, cyberNpcExtras);
for (const npc of cyberNpcs) {
  for (const item of npc.items) {
    const hack = hacks.find(entry => lower(entry.name) === lower(item.name));
    if (!hack) continue;
    if (!item.system.attackDifficulty || !/^\s*(Esquiva|Fortaleza|Voluntad|Hacking|DJ|Ninguna)/i.test(item.system.properties)) item.system.hackDefense = hack.system.defense;
    item.type = item.system.attackDifficulty ? "weapon" : "hack";
    if (item.type === "hack") item.system = { ...hack.system, loaded: true };
  }
  npc.img = npc.system.npcStats.machine ? IMG.machine : IMG.npc;
  for (const item of npc.items) item.system.module = "cyber";
  if (/^Ejecutivo/.test(npc.name)) npc.system.npcStats.villain = { value: 12, max: 12, extraTurnUsed: false };
}
addPack("cyber-npcs", "TDT Cyberpunk · PNJ y máquinas", "Actor", "cyber", cyberNpcs);

/* ---------- Pregenerated characters ---------- */

const SKILL_KEYS = {
  acrobacias: "acrobatics", atletismo: "athletics", ciencia: "science", "combate con armas cac": "melee", construir: "crafting",
  engaño: "deception", interpretación: "performance", intimidación: "intimidation", investigación: "investigation",
  "maniobra de lucha": "brawl", medicina: "medicine", profesión: "profession", puntería: "ranged", religión: "religion",
  sigilo: "stealth", sociedad: "society", supervivencia: "survival", diplomacia: "diplomacy", hacking: "hacking", cibernética: "cybernetics"
};
const ATTR_KEYS = { potencia: "power", destreza: "dexterity", mente: "mind", social: "social" };

function characterActor(name, { attributes = {}, skills = {}, defenses = {}, description = "", items = [], money = 0 }) {
  const system = {
    description,
    health: { value: 10, max: 10 },
    attributes: Object.fromEntries(Object.entries({ power: 4, dexterity: 4, mind: 4, social: 4, ...attributes }).map(([key, die]) => [key, { die }])),
    skills: Object.fromEntries(Object.entries(skills).map(([key, die]) => [key, { die }])),
    defenses: Object.fromEntries(Object.entries({ fortitude: 6, evasion: 6, will: 6, ...defenses }).map(([key, die]) => [key, { die }])),
    money
  };
  return { name, type: "character", img: IMG.npc, system, items };
}

const allFeats = [...basicContent.items.filter(item => item.type === "feat"), ...cyberFeats];
const findFeat = text => {
  const base = text.replace(/\s*\(.*\)$/, "").replace(/…$/, "…");
  const found = allFeats.find(feat => lower(feat.name) === lower(base)) ?? allFeats.find(feat => lower(feat.name).startsWith(lower(base)));
  if (!found) throw new Error(`Dote no encontrada para ${text}`);
  const copy = structuredClone(found);
  if (text !== base) copy.name = text;
  return copy;
};
const genericByName = name => structuredClone(genericWeapons.find(item => item.name === name));
const pregenerated = {
  "Dani, hacker": {
    implants: [["AVS (Advanced VirtualSelf)", { slots: 3, upgrades: ["Cableado"] }]],
    equipment: [["cyber-weapons", "Pistola"], ["cyber-armor", "Chaqueta táctica"]]
  },
  "Kira, mercenaria cromada": {
    implants: [["Brazo robótico", { upgrades: ["Armas ocultas"] }], ["Piernas cibernéticas", {}], ["Médula ósea acelerada", {}]],
    equipment: [["cyber-weapons", "Hoja vibrante"], ["cyber-weapons", "Escopeta"], ["generic", "Cac ligera"]]
  },
  "Nuria, cibermédica": {
    implants: [["Ojos cibernéticos", {}], ["AVS (Advanced VirtualSelf)", { upgrades: ["Cableado"] }]],
    chips: [["science", "Chip de habilidad: Ciencia"]],
    equipment: [["cyber-gear", "Kit de cibernética"], ["cyber-weapons", "Pistola"], ["cyber-armor", "Ropa blindada"]]
  },
  "Teo, piloto del yermo": {
    implants: [["Compresores pulmonares", { upgrades: ["Filtro tóxico"] }]],
    equipment: [["cyber-weapons", "Fusil de asalto"], ["cyber-armor", "Chaleco de placas"]]
  },
  "Marga, negociadora": {
    implants: [["Oído de alto rango", {}], ["AVS (Advanced VirtualSelf)", {}]],
    chips: [["society", "Chip de habilidad: Sociedad"]],
    equipment: [["cyber-weapons", "Pistola"], ["cyber-armor", "Ropa blindada"], ["cyber-gear", "Chip espejo"]]
  }
};
const packItems = { "cyber-weapons": [...firearms, ...meleeWeapons], "cyber-armor": cyberArmor, "cyber-gear": cyberGear };
const characters = headedBlocks(section(cyberMd, "## Personajes de ejemplo", "## Compendio"), 4).map(block => {
  const plan = pregenerated[block.title];
  if (!plan) throw new Error(`Personaje sin anotar: ${block.title}`);
  const attributes = Object.fromEntries([...field(block.body, "Características").matchAll(/(Potencia|Destreza|Mente|Social)\s*d(\d+)/gi)].map(match => [ATTR_KEYS[lower(match[1])], Number(match[2])]));
  const secondary = field(block.body, "Secundarias");
  const defenses = Object.fromEntries([...secondary.matchAll(/(Esquiva|Fortaleza|Voluntad)\s*d(\d+)/gi)].map(match => [{ esquiva: "evasion", fortaleza: "fortitude", voluntad: "will" }[lower(match[1])], Number(match[2])]));
  const skills = Object.fromEntries(field(block.body, "Habilidades").split(",").map(entry => entry.trim().match(/^(.+?)\s+d(\d+)$/i)).filter(Boolean).map(match => [SKILL_KEYS[lower(match[1])], Number(match[2])]).filter(([key]) => key));
  const featNames = field(block.body, "Dotes").split(/,\s*(?![^()]*\))/).map(text => text.trim()).filter(Boolean);
  const items = featNames.map(findFeat);
  for (const [implantName, options] of plan.implants) {
    const implant = structuredClone(implants.find(entry => entry.name === implantName));
    if (options.slots) implant.system.slots = options.slots;
    for (const upgradeEntry of implant.system.upgrades) if (options.upgrades?.includes(upgradeEntry.name)) upgradeEntry.installed = true;
    items.push(implant);
  }
  for (const hackName of field(block.body, "Hacks").split(",").map(text => text.trim()).filter(Boolean)) {
    const hack = structuredClone(hacks.find(entry => entry.name === hackName));
    hack.system.loaded = true;
    items.push(hack);
  }
  for (const [target, chipName] of plan.chips ?? []) {
    const chip = structuredClone(chips[0]);
    chip.name = chipName;
    chip.system.chipTarget = target;
    chip.system.loaded = true;
    items.push(chip);
  }
  for (const [source, itemName] of plan.equipment) {
    const item = source === "generic" ? genericByName(itemName) : structuredClone(packItems[source].find(entry => entry.name === itemName));
    if (!item) throw new Error(`Equipo no encontrado: ${itemName}`);
    if (["weapon", "armor"].includes(item.type) || item.system.category === "terminal") item.system.equipped = true;
    items.push(item);
  }
  const name = block.title.split(",")[0];
  return characterActor(name, {
    attributes,
    skills,
    defenses,
    description: `${block.title}. Personaje de ejemplo del módulo cyberpunk.\n\n${clean(block.body)}`,
    items
  });
});
addPack("cyber-characters", "TDT Cyberpunk · Personajes de ejemplo", "Actor", "cyber", characters);

/* ============================================ */

const output = {
  generatedFrom: ["PorPartes/2 - Módulo básico.md", "PorPartes/modulos_opcionales/*.md"],
  packs
};
fs.writeFileSync(path.join(here, "../data/modules-content.json"), `${JSON.stringify(output, null, 1)}\n`);
for (const pack of packs) console.log(`${pack.name.padEnd(24)} ${String(pack.documents.length).padStart(3)} ${pack.type}`);
