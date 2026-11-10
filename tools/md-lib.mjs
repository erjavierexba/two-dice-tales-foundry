/** Shared helpers to read the TDT manual (markdown is read only, never written). */

export function clean(value = "") {
  return String(value)
    .replace(/\\([.\-+*_()[\]#!>|~])/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,;:])/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export const oneLine = value => clean(value).replace(/\n+/g, " ").trim();

export function section(markdown, start, end) {
  const from = markdown.indexOf(start);
  if (from < 0) throw new Error(`Sección no encontrada: ${start}`);
  const to = end ? markdown.indexOf(end, from + start.length) : -1;
  return markdown.slice(from, to < 0 ? markdown.length : to);
}

/** Rows of the first table whose header contains the needle. */
export function parseTable(text, headerNeedle) {
  const lines = text.split("\n");
  const start = lines.findIndex(line => line.trim().startsWith("|") && line.includes(headerNeedle));
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith("|")) break;
    rows.push(line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => oneLine(cell)));
  }
  return rows;
}

/** Blocks headed by "#### Title" (or another level). */
export function headedBlocks(text, level = 4) {
  const marks = "#".repeat(level);
  const regex = new RegExp(`^${marks}\\s+(.+?)\\s*$([\\s\\S]*?)(?=^#{1,${level}}\\s|(?![\\s\\S]))`, "gm");
  return [...text.matchAll(regex)].map(match => ({ title: match[1].trim(), body: match[2] }));
}

const fieldRegex = name => new RegExp(`^\\s*\\*{0,2}${name}\\*{0,2}:?\\*{0,2}\\s*(.+?)\\s*$`, "im");

export function field(body, ...names) {
  for (const name of names) {
    const match = body.match(fieldRegex(name));
    if (match) return oneLine(match[1]);
  }
  return "";
}

/** Removes the metadata lines (Requisitos, Etiquetas, Complejidad…) from a description. */
export function stripFields(body, names) {
  let text = body;
  for (const name of names) text = text.replace(new RegExp(`^\\s*\\*{0,2}${name}\\*{0,2}:?\\*{0,2}[^\\n]*\\n?`, "gim"), "");
  return clean(text);
}

export const FEAT_FIELDS = ["Requisitos?", "Requiere", "Etiquetas", "Especial(?: \\d)?", "Descripción"];

/** "#### Name (Coste: +N)" feats, plus inline "- **Name (Coste: +N)**" list feats. */
export function parseFeats(text) {
  const feats = [];
  const regex = /^#{3,5}\s+(.+?)\s+\(Coste:\s*([^)]+)\)\s*$([\s\S]*?)(?=^#{1,5}\s|(?![\s\S]))/gm;
  for (const match of text.matchAll(regex)) {
    const name = oneLine(match[1]);
    const costText = oneLine(match[2]).replace(/^\+/, "");
    const body = match[3];
    const tags = field(body, "Etiquetas").split(",").map(tag => tag.replace(/\.$/, "").trim()).filter(Boolean);
    feats.push({ name, costText, body, tags, requirements: field(body, "Requisitos?", "Requiere").replace(/\.$/, ""), description: stripFields(body, ["Requisitos?", "Requiere", "Etiquetas"]) });
  }
  for (const match of text.matchAll(/^\s*[-*]\s+\*\*(.+?)\s+\(Coste:\s*([^)]+)\)\*\*\s*$/gm)) {
    feats.push({ name: oneLine(match[1]), costText: oneLine(match[2]).replace(/^\+/, ""), body: "", tags: [], requirements: "", description: "" });
  }
  return feats;
}

export function costValue(costText) {
  const value = Number(String(costText).replace(/\s/g, "").match(/^[+-]?\d+/)?.[0] ?? 0);
  return value;
}

export function costFormula(costText) {
  const text = String(costText).trim().replace(/^\+/, "");
  return /categor/i.test(text) ? text.replace(/\s*x\s*/gi, " x ") : "";
}

/* -------------------------------------------- */
/*  Rule inference (same approach as the basic content)
/* -------------------------------------------- */

export const scopeTerms = {
  acrobatics: ["acrobacias"], athletics: ["atletismo", "atlética", "atlético"], science: ["ciencia"],
  melee: ["combate con armas cac", "arma cuerpo a cuerpo", "armas cac"], crafting: ["construir", "reparar", "fabricar"],
  deception: ["engaño", "engañar"], performance: ["interpretación"], intimidation: ["intimidación", "intimidar"],
  investigation: ["investigación", "investigar"], brawl: ["maniobra de lucha", "maniobra de combate"],
  medicine: ["medicina", "curar", "primeros auxilios"], profession: ["profesión"], ranged: ["puntería", "disparo"],
  religion: ["religión"], stealth: ["sigilo", "ocult"], society: ["sociedad"],
  survival: ["supervivencia", "rastrear"], diplomacy: ["diplomacia", "ligar"],
  arcana: ["arcano"], nature: ["naturaleza"], superpower: ["superpoder"], hacking: ["hacking", "hackeo", "hackear"], cybernetics: ["cibernética"],
  power: ["potencia"], dexterity: ["destreza"], mind: ["mente"], social: ["social"],
  fortitude: ["fortaleza"], evasion: ["esquiva"], will: ["voluntad"], perception: ["percepción", "vista", "oído"],
  robustness: ["robustez"], maneuver: ["maniobra táctica"], excess: ["exceso de carga"]
};

export function inferScopes(description) {
  const normalized = description.toLocaleLowerCase("es");
  return Object.entries(scopeTerms).filter(([, terms]) => terms.some(term => normalized.includes(term))).map(([scope]) => scope);
}

export function inferFeatRules(name, description) {
  const scopes = inferScopes(description);
  const rules = [{ type: "reminder", scopes, label: name, text: description }];
  const bonusValues = [...description.matchAll(/bonific\w*\s+(?:en\s+)?(\d+)/gi)].map(match => Number(match[1]));
  const penaltyValues = [...description.matchAll(/penaliza(?:dor)?\s+(?:de|en)?\s*(\d+)/gi)].map(match => Number(match[1]));
  if (bonusValues.length) rules.push({ type: "bonus", scopes, value: Math.max(...bonusValues), label: name, optional: true });
  if (penaltyValues.length) rules.push({ type: "penalty", scopes, value: Math.max(...penaltyValues), label: name, optional: true });
  return rules;
}

/* -------------------------------------------- */
/*  Enemies                                      */
/* -------------------------------------------- */

const SKILL_WORDS = {
  hacking: "hacking", sigilo: "stealth", atletismo: "athletics", acrobacias: "acrobatics", investigación: "investigation",
  sociedad: "society", diplomacia: "diplomacy", engaño: "deception", intimidación: "intimidation", supervivencia: "survival",
  cibernética: "cybernetics", construir: "crafting", ciencia: "science"
};

function parseAttackList(line, { hacks = false } = {}) {
  const attacks = [];
  let depth = 0;
  let current = "";
  for (const char of line) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      attacks.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) attacks.push(current.trim());
  return attacks.filter(Boolean).map(entry => {
    const match = entry.match(/^(.+?)\s*\((\d+)\s*(?:,\s*([\s\S]*))?\)\s*(.*)$/);
    if (!match) return { name: entry.replace(/\.$/, ""), difficulty: 0, properties: "", extra: "" };
    let properties = (match[3] ?? "").trim();
    let hackDefense = "";
    if (hacks) {
      const defense = properties.match(/^(Esquiva|Fortaleza|Voluntad|Hacking|DJ|Ninguna)\s*,?\s*/i);
      if (defense) {
        hackDefense = { esquiva: "evasion", fortaleza: "fortitude", voluntad: "will", hacking: "hacking", dj: "gm", ninguna: "none" }[defense[1].toLocaleLowerCase("es")];
        properties = properties.slice(defense[0].length);
      }
    }
    return { name: match[1].trim(), difficulty: Number(match[2]), properties, hackDefense, extra: match[4] };
  });
}

export function enemyWeapon(attack, { hack = false } = {}) {
  const properties = attack.properties;
  const damage = Number(properties.match(/Daño\s*(\d+)/i)?.[1] ?? 0);
  const ammo = Number(properties.match(/munici[oó]n\s*\(?\s*(\d+)/i)?.[1] ?? properties.match(/bater[ií]a\s*\(?\s*(\d+)/i)?.[1] ?? 0);
  const ranged = /munici|bater|rango medio|dispar|bl[aá]ster|pistola|fusil|escopeta|ametralladora|francotirador|lanzacohetes|lanzamisiles|revólver/i.test(`${attack.name} ${properties}`);
  return {
    name: attack.name,
    type: "weapon",
    system: {
      damage,
      attackDifficulty: attack.difficulty,
      skill: ranged ? "ranged" : "melee",
      attribute: ranged ? "dexterity" : "power",
      range: ranged ? "medium" : "contact",
      properties,
      ammo: { value: ammo, max: ammo },
      quantity: 1,
      equipped: true,
      hackDefense: hack ? attack.hackDefense || "evasion" : "",
      defense: "evasion"
    }
  };
}

/** Standard TDT enemy block. */
export function parseEnemy(name, body, extra = {}) {
  const healthText = body.match(/\*\*PV:\*\*\s*([^\n]+)/)?.[1] ?? "10";
  const health = Number(healthText.match(/-?\d+/)?.[0] ?? 10);
  const enduranceText = oneLine(body.match(/\*\*Aguante:\*\*\s*([^\n]+)/)?.[1] ?? "0");
  const endurance = Number(enduranceText.match(/-?\d+/)?.[0] ?? 0);
  const hackEndurance = enduranceText.match(/\((\d+)\s+contra hacks\)/i)?.[1] ?? "";
  const shotEndurance = enduranceText.match(/\((\d+)\s+contra disparos\)/i)?.[1] ?? "";
  const defenses = (body.match(/\*\*Esquiva \/ Fortaleza \/ Voluntad \/ Percepción:\*\*\s*([^\n]+)/)?.[1] ?? "5/5/5/5")
    .replace(/\\/g, "")
    .split("/")
    .map(value => Number(value.trim()) || 0);
  const attackLine = oneLine(body.match(/\*\*Ataques?:\*\*\s*([^\n]+)/)?.[1] ?? "");
  const hackLine = oneLine(body.match(/\*\*Hacks:\*\*\s*([^\n]+)/)?.[1] ?? "");
  const skillsText = oneLine(body.match(/\*\*Habilidades:\*\*\s*([^\n]+)/)?.[1] ?? "").replace(/\.$/, "");
  const traits = oneLine(body.match(/\*\*Rasgos:\*\*\s*([^\n]+)/)?.[1] ?? "");
  const variants = oneLine(body.match(/\*\*Variantes sencillas:\*\*\s*([^\n]+)/)?.[1] ?? "");
  const items = [
    ...parseAttackList(attackLine).filter(attack => attack.difficulty).map(attack => enemyWeapon(attack)),
    ...parseAttackList(hackLine, { hacks: true }).map(attack => enemyWeapon(attack, { hack: true }))
  ];
  let hacking = 4;
  const hackingMatch = skillsText.match(/hacking\s+(\d+)/i);
  if (hackingMatch) hacking = Number(hackingMatch[1]);
  const villain = Number(`${traits} ${variants}`.match(/^(?:.*?)\bvillano\*?\*?\s+con fuente de villano\s+(\d+)/i)?.[1] ?? 0);
  const hackDifficulty = Number(traits.match(/hackear(?:lo|la)? tiene dificultad\s+(\d+)/i)?.[1] ?? 0);
  return {
    name,
    type: "npc",
    system: {
      description: skillsText ? `Habilidades: ${skillsText}.` : "",
      health: { value: health, max: health },
      endurance: { base: endurance, value: endurance },
      npcStats: {
        evasion: defenses[0],
        fortitude: defenses[1],
        will: defenses[2],
        perception: defenses[3] || 5,
        traits,
        variants,
        skills: skillsText,
        hacking,
        hackEndurance,
        shotEndurance,
        hackDifficulty,
        villain: { value: villain, max: villain, extraTurnUsed: false },
        ...extra
      }
    },
    items
  };
}

export function parseEnemies(text, level = 5, extra = () => ({})) {
  return headedBlocks(text, level)
    .filter(block => /\*\*PV:\*\*/.test(block.body))
    .map(block => parseEnemy(oneLine(block.title), block.body, extra(oneLine(block.title), block.body)));
}

export const skillWordMap = SKILL_WORDS;
