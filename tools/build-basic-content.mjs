import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Folder of the manual repository (TDT). By default, a sibling folder called TDT; override with TDT_MANUAL.
const root = path.resolve(process.env.TDT_MANUAL ?? path.join(here, "../../TDT"));
const sourcePath = path.join(root, "PorPartes/2 - Módulo básico.md");
const outputPath = path.join(here, "../data/basic-content.json");
const markdown = fs.readFileSync(sourcePath, "utf8").replaceAll("\\.", ".");

function clean(value = "") {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function section(start, end) {
  const from = markdown.indexOf(start);
  const to = end ? markdown.indexOf(end, from + start.length) : markdown.length;
  return markdown.slice(from, to < 0 ? markdown.length : to);
}

function parseTable(text, headerNeedle) {
  const lines = text.split("\n");
  const start = lines.findIndex(line => line.startsWith("|") && line.includes(headerNeedle));
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(line.slice(1, -1).split("|").map(clean));
  }
  return rows;
}

const scopeTerms = {
  acrobatics: ["acrobacias"], athletics: ["atletismo", "atlética", "atlético"], science: ["ciencia"],
  melee: ["combate con armas cac", "arma cuerpo a cuerpo"], crafting: ["construir", "reparar"],
  deception: ["engaño", "engañar"], performance: ["interpretación"], intimidation: ["intimidación", "intimidar"],
  investigation: ["investigación", "investigar"], brawl: ["maniobra de lucha", "maniobra de combate"],
  medicine: ["medicina", "curar", "primeros auxilios"], profession: ["profesión"], ranged: ["puntería", "disparo"],
  religion: ["religión"], stealth: ["sigilo", "ocult", "seguir a alguien"], society: ["sociedad"],
  survival: ["supervivencia", "rastrear"], diplomacy: ["diplomacia", "ligar"],
  power: ["potencia"], dexterity: ["destreza"], mind: ["mente"], social: ["social"],
  fortitude: ["fortaleza"], evasion: ["esquiva"], will: ["voluntad"], perception: ["percepción", "vista", "oído"]
};

function inferScopes(description) {
  const normalized = description.toLocaleLowerCase("es");
  return Object.entries(scopeTerms)
    .filter(([, terms]) => terms.some(term => normalized.includes(term)))
    .map(([scope]) => scope);
}

function inferFeatRules(name, description) {
  const scopes = inferScopes(description);
  const rules = [{ type: "reminder", scopes, label: name, text: description }];
  const bonusValues = [...description.matchAll(/bonific\w*\s+(?:en\s+)?(\d+)/gi)].map(match => Number(match[1]));
  const penaltyValues = [...description.matchAll(/penaliza(?:dor)?\s+(?:de|en)?\s*(\d+)/gi)].map(match => Number(match[1]));
  if (bonusValues.length) rules.push({ type: "bonus", scopes, value: Math.max(...bonusValues), label: name });
  if (penaltyValues.length) rules.push({ type: "penalty", scopes, value: Math.max(...penaltyValues), label: name });
  if (/incrementa|aumenta (?:tu |el |ambos )?dado|dado superior/i.test(description)) rules.push({ type: "dieStep", scopes, value: 1, target: /ambos dados/i.test(description) ? "both" : "scoped", label: name });
  if (/reduce (?:tu |el )?dado|baja (?:tu |el )?dado/i.test(description)) rules.push({ type: "dieStep", scopes, value: -1, label: name });
  if (/tira (?:dos veces|de nuevo)|a[nñ]adele? (?:un )?1d4/i.test(description) && /qu[eé]date con (?:el|los) (?:menor(?:es)?|peor(?:es)?)/i.test(description)) rules.push({ type: "disadvantage", scopes, value: 1, label: name });
  if (/inmune a las pifias/i.test(description)) rules.push({ type: "noFumble", scopes, value: 1, label: name });
  return rules;
}

const feats = [];
const featBlock = section("### Desventajas", "### Inventario");
const featMatches = [...featBlock.matchAll(/^####\s+(.+?)\s+\(Coste:\s*([+-]?\d+)\)\s*$([\s\S]*?)(?=^####\s|^###\s|(?![\s\S]))/gm)];
for (const match of featMatches) {
  const name = clean(match[1]);
  const cost = Number(match[2]);
  const description = clean(match[3]);
  const requirements = clean(match[3].match(/\*\*Requisitos:\*\*\s*([^\n]+)/i)?.[1] ?? "");
  feats.push({
    name,
    type: "feat",
    system: {
      description,
      cost,
      requirements,
      category: cost < 0 ? "disadvantage" : "advantage",
      rules: inferFeatRules(name, description)
    }
  });
}

const equipmentBlock = section("### Armas y armaduras", "### Listado de enemigos");
const weaponsBlock = section("#### Opcional: armas específicas", "#### Propiedades de las armas");
const weaponRows = parseTable(weaponsBlock, "Arma");
const meleeNames = new Set(["Cuerpo (desarmado)", "Cuchillo de combate", "Martillo de mano", "Espada medieval", "Katana", "Espadón", "Lanza /Alabarda"]);
const weapons = weaponRows.map(([name, primary, properties]) => {
  const damage = Number(properties.match(/Daño\s*(\d+)/i)?.[1] ?? 0);
  const ammo = Number(properties.match(/Munición\s*\((\d+)\)/i)?.[1] ?? 0);
  const isMelee = meleeNames.has(name);
  return {
    name,
    type: "weapon",
    system: {
      description: `Característica: ${primary}. Propiedades: ${properties}`,
      damage,
      skill: isMelee ? (name === "Cuerpo (desarmado)" ? "brawl" : "melee") : "ranged",
      attribute: primary.includes("Destreza") && !primary.includes("Potencia") ? "dexterity" : "power",
      range: isMelee ? "contact" : "medium",
      properties,
      ammo: { value: ammo, max: ammo },
      quantity: 1,
      equipped: false
    }
  };
});

const armorRows = parseTable(section("####  Armaduras", "### Objetos"), "Tipo de armadura");
const armors = armorRows.map(([name, endurance, evasionPenalty, powerRequired]) => ({
  name: `Armadura ${name.toLowerCase()}`,
  type: "armor",
  system: {
    description: `Potencia necesaria: ${powerRequired}`,
    endurance: Number(endurance),
    evasionPenalty: Math.abs(Number(evasionPenalty) || 0),
    powerRequired: Number(powerRequired.match(/d(\d+)/)?.[1] ?? 0),
    quantity: 1,
    equipped: false
  }
}));

const objectRows = parseTable(section("### Objetos", "### Vehículos"), "Objeto");
const consumableNames = new Set(["Bebidas alcohólicas", "Droga estimulante", "Veneno"]);
const gear = objectRows
  .filter(([, description]) => description)
  .map(([name, description]) => ({ name, type: "gear", system: { description, category: consumableNames.has(name) ? "consumable" : "misc", quantity: 1, equipped: false } }));

const vehicleRows = parseTable(section("### Vehículos", "### Listado de enemigos"), "Vehículo");
for (const [name, capacity, driving, health, endurance, special] of vehicleRows) {
  gear.push({
    name,
    type: "gear",
    system: {
      description: `Vehículo. Pasajeros: ${capacity}. Modificador de conducción: ${driving}. Vida: ${health}. Aguante: ${endurance}. ${special}`,
      category: "vehicle",
      quantity: 1,
      equipped: false
    }
  });
}

const actors = [];
const enemyBlock = section("### Listado de enemigos");
const enemyMatches = [...enemyBlock.matchAll(/^#####\s+(.+)\s*$([\s\S]*?)(?=^#####\s|^####\s|(?![\s\S]))/gm)];
for (const match of enemyMatches) {
  const name = clean(match[1]);
  const body = match[2];
  const health = Number(body.match(/\*\*PV:\*\*\s*(-?\d+)/)?.[1] ?? 10);
  const endurance = Number(body.match(/\*\*Aguante:\*\*\s*(-?\d+)/)?.[1] ?? 0);
  const defenses = body.match(/\*\*Esquiva \/ Fortaleza \/ Voluntad \/ Percepción:\*\*\s*([^\n]+)/)?.[1]?.split("/").map(value => Number(value.trim()) || 0) ?? [5, 5, 5, 5];
  const attackLine = clean(body.match(/\*\*Ataques?:\*\*\s*([^\n]+)/)?.[1] ?? "");
  const attacks = [...attackLine.matchAll(/([^,]+?)\((\d+)\s*,\s*([^)]*)\)/g)].map(attack => {
    const properties = clean(attack[3]);
    const damage = Number(properties.match(/Daño\s*(\d+)/i)?.[1] ?? 0);
    const ammo = Number(properties.match(/munición\s*(\d+)/i)?.[1] ?? 0);
    return {
      name: clean(attack[1]).replace(/^,\s*/, ""),
      type: "weapon",
      system: {
        damage,
        attackDifficulty: Number(attack[2]),
        properties,
        ammo: { value: ammo, max: ammo },
        quantity: 1,
        equipped: true
      }
    };
  });
  actors.push({
    name,
    type: "npc",
    system: {
      description: clean(body.match(/\*\*Habilidades:\*\*\s*([^\n]+)/)?.[1] ?? ""),
      health: { value: health, max: health },
      endurance: { base: endurance, value: endurance },
      npcStats: {
        evasion: defenses[0],
        fortitude: defenses[1],
        will: defenses[2],
        perception: defenses[3],
        traits: clean(body.match(/\*\*Rasgos:\*\*\s*([^\n]+)/)?.[1] ?? ""),
        variants: clean(body.match(/\*\*Variantes sencillas:\*\*\s*([^\n]+)/)?.[1] ?? "")
      }
    },
    items: attacks
  });
}

const output = {
  generatedFrom: "PorPartes/2 - Módulo básico.md",
  items: [...feats, ...weapons, ...armors, ...gear],
  actors
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Contenido TDT generado: ${output.items.length} objetos y ${output.actors.length} PNJ.`);
