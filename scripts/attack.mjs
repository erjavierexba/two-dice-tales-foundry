import { TDT } from "./config.mjs";
import { dieScore, evaluateFormula } from "./dice.mjs";

const number = (text, regex) => {
  const match = String(text ?? "").match(regex);
  return match ? Number(match[1]) : 0;
};

/** Reads the properties text of a weapon ("Daño 5, Munición (4), Quemarropa 8…") into a structured object. */
export function parseWeaponProperties(text = "") {
  const source = String(text ?? "").replace(/\*\*/g, "");
  const lower = source.toLocaleLowerCase("es");
  const multi = source.match(/golpe m[uú]ltiple\s*\(\s*([^,\[\]]+?)\s*(?:\[\s*(\d+)\s*\])?\s*,\s*(\d+)\s*\)/i);
  const weakness = source.match(/debilidad\s*\(\s*\[?([^\]\)]*?)\]?\s*,\s*(\d+)\s*\)/i);
  const powerDie = number(source, /potencia\s*1?d(\d+)/i);
  return {
    damage: number(source, /(?:^|[,.;]\s*|\s)da[ñn]o\s*(\d+)/i),
    area: number(source, /[áa]rea\s*\(?\s*(\d+)/i),
    pointBlank: number(source, /quemarropa\s*\(?\s*(\d+)/i),
    concentrated: number(source, /golpe concentrado\s*\(?\s*(\d+)/i),
    contusion: number(source, /contusi[oó]n\s*\(?\s*(\d+)/i),
    stun: number(source, /aturdidora\s*\(?\s*(\d+)/i),
    ammo: number(source, /munici[oó]n\s*\(\s*(\d+)\s*\)/i) || number(source, /munici[oó]n\s+(\d+)/i),
    battery: number(source, /bater[ií]a\s*\(\s*(\d+)\s*\)/i) || number(source, /bater[ií]a\s+(\d+)/i),
    startup: number(source, /arranque\s*\(\s*(\d+)\s*\)/i),
    size: number(source, /tama[ñn]o\s*\(?\s*(\d+)/i),
    attackPenalty: number(source, /penaliza en (\d+)/i),
    // Both orders appear in the manual: "Contra seres vivos, Daño 8" and "Daño 8 contra seres vivos".
    vsMachines: number(source, /contra (?:robots|m[aá]quinas)[^.]*?da[ñn]o\s*(\d+)/i) || number(source, /da[ñn]o\s*(\d+)\s*contra (?:robots|m[aá]quinas)/i),
    vsLiving: number(source, /contra seres vivos[^.]*?da[ñn]o\s*(\d+)/i) || number(source, /da[ñn]o\s*(\d+)\s*contra seres vivos/i),
    powerRequired: powerDie && /potencia\s*1?d\d/i.test(source) ? powerDie : 0,
    multiHit: multi ? { formula: multi[1].trim(), max: Number(multi[2] || 0) || Number(evaluateFormula(multi[1]) || 0), damage: Number(multi[3]) } : null,
    weakness: weakness ? { against: weakness[1].trim(), value: Number(weakness[2]) } : null,
    dual: /\bdual\b/i.test(source),
    singleAttack: /ataque [uú]nico|disparo [uú]nico/i.test(source),
    forceful: /forzuda/i.test(source),
    thrown: /arrojadiza/i.test(source),
    consumable: /consumible/i.test(source),
    antiStructure: /antiestructura/i.test(source),
    armorBreaker: /rompearmaduras/i.test(source),
    pierce: /\bperfora\b/i.test(source),
    shield: /\bblinda\b/i.test(source),
    hand: /\bmano\b/i.test(source),
    support: /\bsoporte\b/i.test(source),
    cooldown: /enfriamiento/i.test(source),
    reach: /\brango\b/i.test(source),
    noReload: /sin recarga/i.test(source),
    aerial: /a[ée]reo/i.test(source),
    ground: /terrestre/i.test(source),
    analog: /anal[oó]gico/i.test(source),
    lower
  };
}

/**
 * Everything an attack needs to know about a weapon in the hands of an actor,
 * including optional rules (state, upgrades) and module upgrades.
 */
export function weaponProfile(item, actor, { rule = () => false, moduleActive = () => false, mechaCategory = 1 } = {}) {
  const system = item.system;
  const props = parseWeaponProperties(system.properties);
  const notes = [];
  let damage = Number(system.damage ?? props.damage ?? 0);
  let bonus = 0;
  let penalty = props.attackPenalty || 0;
  let ammoMax = Number(system.ammo?.max || 0);
  let pointBlank = props.pointBlank;
  let concentrated = props.concentrated;
  let area = props.area;
  let minimumDamage = 0;
  let selfDamage = 0;
  const optionalRules = [];
  const isMelee = ["melee", "brawl"].includes(system.skill) || system.range === "contact";
  const isFirearm = !isMelee && system.skill === "ranged";
  let broken = false;

  if (system.mecha?.enabled) {
    const category = actor?.type === "mecha" ? Number(mechaCategory || 1) : Number(system.mecha.category || 1);
    const perCategory = props.size || Number(system.mecha.size || 0) || 2;
    const increase = Math.max(0, category - 1) * perCategory;
    damage += increase;
    if (area) area += increase;
    if (concentrated) concentrated += increase;
  }

  if (props.forceful && actor?.system?.attributes?.power) {
    const forcefulBonus = Math.ceil(dieScore(actor.system.attributes.power.value ?? actor.system.attributes.power.die) / 2);
    damage += forcefulBonus;
    notes.push(`Forzuda: Daño +${forcefulBonus}`);
  }

  if (rule("weaponCondition") && actor?.type !== "npc") {
    const condition = system.condition || "normal";
    if (condition === "pristine") {
      damage += 1;
      notes.push("Impoluta: Daño +1");
    } else if (condition === "damaged") {
      if (isMelee) {
        damage -= 1;
        notes.push("Dañada: Daño −1");
      } else {
        penalty += 1;
        notes.push("Dañada: penaliza 1");
      }
    } else if (condition === "broken") {
      broken = true;
    }
  }

  if (rule("weaponUpgrades")) {
    const upgrades = new Set(system.upgrades?.basic ?? []);
    if (upgrades.has("doubleMag")) ammoMax *= 2;
    if (upgrades.has("potent")) {
      damage += 1;
      if (area) area += 1;
      if (concentrated) concentrated += 1;
    }
    for (const key of upgrades) if (TDT.basicWeaponUpgrades[key]) notes.push(`${TDT.basicWeaponUpgrades[key]}: ${TDT.basicWeaponUpgradeText[key]}`);
  }

  const general = system.upgrades?.general || "";
  const special = system.upgrades?.special || "";
  const flags = actor?._tdtFlags ?? new Set();
  if (general === "smart") {
    damage -= 1;
    if (flags.has("eyeWeaponSync") && !flags.has("animal")) {
      bonus += 2;
      notes.push("Inteligente: bonifica 2, Daño −1 (hackeable)");
    } else {
      notes.push("Inteligente sin Sincronización ojo-arma: solo Daño −1");
    }
  } else if (general === "brute") {
    penalty += 1;
    damage += 3;
    if (special !== "lastChamber" && !/rev[oó]lver/i.test(item.name)) ammoMax = Math.floor(ammoMax / 2);
    notes.push("Bruta: penaliza 1, Daño +3");
  } else if (general === "heavy") {
    penalty += 1;
    damage += 3;
    notes.push("Pesada: penaliza 1, Daño +3; si fallas, tu siguiente Esquiva penaliza 1 y no se bonifica");
  } else if (general === "residual") {
    minimumDamage = 2;
    notes.push("Residual: mínimo 2 de daño al acertar");
  }

  switch (special) {
    case "firstShot":
      optionalRules.push({ type: "bonus", value: 1, label: "Primer disparo (primer ataque contra este objetivo)", optional: true });
      break;
    case "lastChamber":
      if (Number(system.ammo?.value) === 1 && ammoMax > 1) {
        damage += 2;
        bonus += 1;
        notes.push("Último tambor: Daño +2 y bonifica 1");
      } else optionalRules.push({ type: "bonus", value: 1, label: "Último tambor (última bala del tambor; además Daño +2)", optional: true, damage: 2 });
      break;
    case "leadRain":
      notes.push("Lluvia de plomo: en ataque múltiple contra un mismo objetivo, cada acierto Daño +1");
      break;
    case "suppression":
      notes.push("Fuego de supresión disponible (gasta 3 de munición)");
      break;
    case "highPower":
      damage += 4;
      if (pointBlank) pointBlank += 4;
      if (!flags.has("roboticArm")) selfDamage = 1;
      notes.push(`Alta potencia: Daño +4${selfDamage ? "; sin brazo robótico, 1 de daño por retroceso" : ""}`);
      break;
    case "tripod":
      optionalRules.push({ type: "bonus", value: 1, label: "Trípode (no te has movido: bonifica 1 e ignora Potencia)", optional: true, ignorePower: true });
      break;
    case "hawkEye":
      optionalRules.push({ type: "bonus", value: 1, label: "Ojo de halcón (objetivo a distancia larga o más)", optional: true });
      break;
    case "heatSeeking":
      notes.push("Guiado térmico: ignora la cobertura ligera y mediana");
      break;
    default:
      break;
  }

  const powerRequired = props.powerRequired;
  let powerDifficulty = 0;
  if (powerRequired && actor?.system?.attributes?.power) {
    const actorPower = Math.max(Number(actor.system.attributes.power.value ?? actor.system.attributes.power.die), flags.has("servomotors") ? 8 : 0);
    if (actorPower < powerRequired) powerDifficulty = 4;
  }

  return {
    props,
    damage,
    bonus,
    penalty,
    ammoMax,
    pointBlank,
    concentrated,
    area,
    minimumDamage,
    selfDamage,
    optionalRules,
    notes,
    broken,
    isMelee,
    isFirearm,
    powerDifficulty,
    general,
    special
  };
}

const IMMUNITY_DEFENSES = new Set(["evasion", "fortitude", "will", "perception"]);

/** An enemy with "-" in a defense (stored as 0 or empty) is immune to anything that targets it. */
export function targetImmune(actor, defense = "evasion") {
  if (actor?.type !== "npc" || !IMMUNITY_DEFENSES.has(defense)) return false;
  const raw = actor.system.npcStats?.[defense];
  if (raw === null || raw === undefined) return false;
  const text = String(raw).trim();
  return text === "" || text === "-" || Number(text) <= 0;
}

const MACHINE_ACTOR_TYPES = new Set(["vehicle", "emplacement"]);

/** Mechas, vehicles, stationary weapons and NPCs marked as machines (for "Daño X contra máquinas"). */
export function isMachineTarget(actor) {
  return actor?.type === "mecha" || MACHINE_ACTOR_TYPES.has(actor?.type) || Boolean(actor?.system?.npcStats?.machine);
}

/** Defense value of a target actor against an attack, as a fixed number (NPC) or null (character: opposed, or immune NPC). */
export function targetDefense(actor, defense = "evasion") {
  if (!actor) return null;
  // Vehicles and stationary weapons: a fixed Esquiva when set (parked, or a turret); otherwise the driver dodges.
  if (MACHINE_ACTOR_TYPES.has(actor.type)) {
    if (!["evasion", "fortitude"].includes(defense)) return null;
    const value = actor.system.evasion;
    return value === null || value === undefined || value === "" ? null : Number(value);
  }
  if (actor.type === "npc") {
    if (defense === "hacking") return Number(actor.system.npcStats?.hacking || 4) || 4;
    if (defense === "gm") return Number(actor.system.npcStats?.hackDifficulty || 0) || null;
    if (targetImmune(actor, defense)) return null;
    const value = Number(actor.system.npcStats?.[defense]);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/** Every target is immune to this defense: there is nothing to roll. */
export function allTargetsImmune(targets, defense = "evasion") {
  return targets.length > 0 && targets.every(target => targetImmune(target, defense));
}

/** Warns and returns true when every target is immune, so the caller can stop before rolling. */
export function warnIfAllImmune(targets, defense = "evasion") {
  if (!allTargetsImmune(targets, defense)) return false;
  const label = TDT.hackDefenses[defense] ?? TDT.attackDefenses[defense] ?? defense;
  ui.notifications.warn(`${targets.map(target => target.name).join(", ")}: ${label} «-», ${targets.length > 1 ? "son inmunes" : "es inmune"}. No hay nada que tirar.`);
  return true;
}

/** Hint shown in the roll dialog for a single target: its fixed defense, an opposed roll, or immunity. */
export function automaticDifficultyText(targets, defense = "evasion") {
  if (targets.length !== 1) return null;
  const [target] = targets;
  const label = TDT.hackDefenses[defense] ?? TDT.attackDefenses[defense] ?? defense;
  if (targetImmune(target, defense)) return `${target.name}: inmune (${label} «-»)`;
  const value = targetDefense(target, defense);
  return value === null ? `${target.name}: tirada enfrentada` : `${target.name}: ${label} ${value}`;
}

/** Endurance of a target against a given kind of attack. */
export function targetEndurance(actor, { hack = false, shot = false, ignoreHuman = false, machineZero = false } = {}) {
  if (!actor) return 0;
  const system = actor.system;
  const isMachine = isMachineTarget(actor);
  if (hack && machineZero && isMachine) return 0;
  if (hack && ignoreHuman && !isMachine) return 0;
  if (MACHINE_ACTOR_TYPES.has(actor.type)) return Number(system.endurance?.value || 0);
  if (actor.type === "npc") {
    if (hack && system.npcStats?.hackEndurance !== "" && system.npcStats?.hackEndurance !== null && system.npcStats?.hackEndurance !== undefined) return Number(system.npcStats.hackEndurance) || 0;
    if (shot && system.npcStats?.shotEndurance !== "" && system.npcStats?.shotEndurance !== null && system.npcStats?.shotEndurance !== undefined) return Number(system.npcStats.shotEndurance) || 0;
    return Number(system.endurance?.base ?? system.endurance?.value ?? 0);
  }
  if (actor.type === "mecha") return Number(system.endurance?.value || 0);
  if (hack) return actor._tdtFlags?.has("pirateChip") ? 0 : Number(system.endurance?.natural ?? system.endurance?.base ?? 0);
  if (shot) return Number(system.endurance?.vsShots ?? system.endurance?.value ?? 0);
  return Number(system.endurance?.value || 0);
}

/**
 * Final damage of a hit: incoming + Damage − Endurance (+ mecha extra hits after endurance).
 * Returns 0 when the attack misses.
 */
export function finalDamage({ total, defense, damage, endurance, minimum = 0, afterEndurance = 0, multiplier = 1 }) {
  if (defense !== null && defense !== undefined && total < defense) return { hit: false, incoming: 0, damage: 0 };
  const incoming = Math.max(0, total - (defense ?? total));
  let value = incoming + damage - endurance + afterEndurance;
  if (minimum) value = Math.max(minimum, value);
  value = Math.max(0, value) * multiplier;
  return { hit: true, incoming, damage: value };
}
