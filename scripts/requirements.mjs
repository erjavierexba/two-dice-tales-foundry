import { TDT } from "./config.mjs";

const NUMBER_WORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, seis: 6, siete: 7, doce: 12 };
const MANUAL_REQUIREMENT = /(?:tu personaje|tu dj|criatura enemiga|disparar dos armas|tener un cañ[oó]n|modificadores positivos|modificadores negativos)/i;

export function normalizeRequirement(value) {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
}

function itemAliases(item) {
  const name = normalizeRequirement(item.name);
  const aliases = [name];
  if (name.includes(":")) aliases.push(name.slice(name.indexOf(":") + 1).trim());
  return aliases;
}

function hasNamedItem(actor, requirement) {
  const wanted = normalizeRequirement(requirement);
  if (wanted === "simbolo metafisico magia" && [...(actor.items ?? [])].some(item => normalizeRequirement(item.name) === "iniciado arcano")) return true;
  return [...(actor.items ?? [])].some(item => itemAliases(item).some(alias => alias === wanted || alias.startsWith(`${wanted} (`)));
}

function prohibitedConflict(description, candidates) {
  const marker = "prohibido en caso de coger ";
  const start = normalizeRequirement(description).indexOf(marker);
  if (start < 0) return null;
  const remainder = normalizeRequirement(description).slice(start + marker.length);
  return candidates
    .filter(entry => itemAliases(entry).some(alias => remainder.startsWith(alias)))
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

function statValue(actor, label) {
  const wanted = normalizeRequirement(label).replace(/^combate cac$/, "combate con armas cac");
  for (const [key, name] of Object.entries(TDT.attributes)) if (normalizeRequirement(name) === wanted) return Number(actor.system?.attributes?.[key]?.value ?? actor.system?.attributes?.[key]?.die ?? 0);
  for (const [key, name] of Object.entries(TDT.defenses)) if (normalizeRequirement(name) === wanted) return Number(actor.system?.defenses?.[key]?.value ?? actor.system?.defenses?.[key]?.die ?? 0);
  for (const [key, name] of Object.entries(TDT.skills)) if (normalizeRequirement(name) === wanted) return Number(actor.system?.skills?.[key]?.value ?? actor.system?.skills?.[key]?.die ?? 0);
  if (wanted === "aptitud magica") {
    const key = actor.system?.fantasy?.magicSkill || "arcana";
    return Number(actor.system?.skills?.[key]?.value ?? actor.system?.skills?.[key]?.die ?? 0);
  }
  return null;
}

function featCount(actor, kind) {
  const feats = [...(actor.items ?? [])].filter(item => item.type === "feat");
  if (kind === "modificador") return feats.filter(item => normalizeRequirement(item.name).startsWith("modificador:")).length;
  if (kind === "simbolo") return feats.filter(item => normalizeRequirement(item.name).startsWith("simbolo ")).length;
  if (kind === "simbolo elemental") return feats.filter(item => normalizeRequirement(item.name).startsWith("simbolo elemental:")).length;
  return feats.filter(item => item.system?.module === "fantasy" || (item.system?.tags ?? []).some(tag => normalizeRequirement(tag) === "magia")).length;
}

function evaluateAlternative(actor, source) {
  const text = source.trim();
  const normalized = normalizeRequirement(text);
  if (!normalized || MANUAL_REQUIREMENT.test(normalized)) return { ok: true, manual: text };

  const die = normalized.match(/^(.+?)\s+(?:1)?d(4|6|8|10|12)$/i);
  if (die) {
    const actual = statValue(actor, die[1]);
    if (actual !== null) return { ok: actual >= Number(die[2]) };
  }

  const count = normalized.match(/^(?:al menos\s+)?(\d+|un|una|uno|dos|tres|cuatro|seis|siete|doce)\s+dotes?\s+(?:magicas?\s+aprendidas?|de\s+(modificador|simbolo))$/);
  if (count) {
    const needed = Number(count[1]) || NUMBER_WORDS[count[1]] || 0;
    return { ok: featCount(actor, count[2] || "magica") >= needed };
  }
  if (/^(?:un|una) simbolo elemental$/.test(normalized)) return { ok: featCount(actor, "simbolo elemental") >= 1 };
  return { ok: hasNamedItem(actor, text) };
}

/** Comprueba requisitos mecánicos; las condiciones narrativas quedan expresamente en manos del DJ. */
export function checkItemRequirements(actor, itemData) {
  const requirements = String(itemData.system?.requirements ?? "").trim();
  const clauses = requirements ? requirements.split(/\s*,\s*|\s+\by\b\s+/i).filter(Boolean) : [];
  const missing = [];
  const manual = [];
  for (const clause of clauses) {
    const alternatives = clause.split(/\s+\bo\b\s+/i).map(part => evaluateAlternative(actor, part));
    if (alternatives.some(result => result.ok && !result.manual)) continue;
    if (alternatives.every(result => result.manual)) manual.push(clause.trim());
    else if (!alternatives.some(result => result.ok)) missing.push(clause.trim());
  }

  const existing = [...(actor.items ?? [])];
  const directConflict = prohibitedConflict(itemData.system?.description, existing);
  if (directConflict) missing.push(`incompatible con ${directConflict.name}`);
  const reverseConflict = existing.find(item => prohibitedConflict(item.system?.description, [itemData]));
  if (reverseConflict) missing.push(`incompatible con ${reverseConflict.name}`);
  return { ok: missing.length === 0, missing, manual };
}

export function requirementFailureMessage(itemData, result) {
  return `No puedes añadir ${itemData.name}: falta ${result.missing.join("; ")}.`;
}
