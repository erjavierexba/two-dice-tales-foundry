import { dieScore } from "../dice.mjs";

/** AVS ranuras: base 1; the 2nd costs 1 CC, from the 3rd on 2 CC each; max 5. */
export function avsSlotCost(slots) {
  const count = Math.max(1, Math.min(5, Number(slots) || 1));
  let cost = 0;
  for (let slot = 2; slot <= count; slot++) cost += slot === 2 ? 1 : 2;
  return cost;
}

/** CC cost of an implant including its installed upgrades (and AVS extra slots). */
export function implantCost(implant) {
  const system = implant.system ?? implant;
  if (system.supreme?.enabled) return 0;
  let cost = Number(system.cc || 0);
  for (const upgrade of system.upgrades ?? []) if (upgrade.installed) cost += Number(upgrade.cc || 0);
  if (isAVS(implant)) cost += avsSlotCost(system.slots);
  return cost;
}

export function isAVS(implant) {
  return /^avs\b|advanced virtualself/i.test(implant.name ?? "");
}

export function implantTierFromCost(cost) {
  if (cost >= 10) return "extreme";
  if (cost >= 7) return "major";
  if (cost >= 4) return "moderate";
  return "minor";
}

/** CC = 10 + Social score × 5 + modifiers − CC lost forever to supreme implants. */
export function cyberStats(actor, collected) {
  const system = actor.system;
  const social = system.attributes.social;
  const cc = 10 + dieScore(social.value ?? social.die) * 5 + Number(collected.values.cc || 0) - Number(system.cyber?.ccLost || 0);
  const implants = actor.items.filter(item => item.type === "implant" && item.system.installed !== false);
  const load = implants.reduce((sum, item) => sum + implantCost(item), 0);
  const avs = implants.find(item => isAVS(item));
  const terminal = actor.items.find(item => item.type === "gear" && item.system.category === "terminal" && item.system.equipped);
  let slots = 0;
  let hackPenalty = 0;
  let source = "";
  if (avs && !avs.system.offline) {
    slots = Math.max(1, Math.min(5, Number(avs.system.slots) || 1));
    source = "AVS";
  } else if (terminal) {
    slots = 2;
    hackPenalty = 3;
    source = "Terminal externo";
  }
  slots += Number(collected.values.hackSlots || 0);
  const chips = actor.items.filter(item => item.type === "gear" && item.system.category === "skillChip" && item.system.loaded).length;
  const loadedHacks = actor.items.filter(item => item.type === "hack" && item.system.loaded).length;
  const usesMax = Math.max(0, slots - chips);
  const avsUpgrades = new Set((avs?.system.upgrades ?? []).filter(upgrade => upgrade.installed).map(upgrade => (upgrade.key || upgrade.name || "").toLocaleLowerCase("es")));
  return {
    cc,
    load,
    excess: Math.max(0, load - cc),
    slots,
    chips,
    loadedHacks,
    usedSlots: chips + loadedHacks,
    usesMax,
    usesLeft: Math.max(0, usesMax - Number(system.cyber?.hackUses || 0)),
    hackPenalty,
    source,
    wiredCapable: avsUpgrades.has("cableado") || avsUpgrades.has("wired") || Boolean(terminal) || collected.flags.has("hackerHands"),
    longRange: avsUpgrades.has("antena de larga frecuencia") || avsUpgrades.has("antenna"),
    firewall: avsUpgrades.has("extrafirewall") || avsUpgrades.has("firewall")
  };
}

/** Exceso de carga: Voluntad vs 4 + excess. */
export function excessOutcome(result, excess) {
  if (result.success) return { key: "ok", text: "Sigues siendo tú." };
  const failedBy = Math.max(0, result.difficulty - result.total);
  if (excess >= 10) return { key: "misaligned", text: "DESALINEADO. Su VirtualSelf se conecta solo a internet y Eva entra. No hay vuelta atrás: el personaje pasa a manos del DJ." };
  if (result.isFumble || failedBy >= 4) return { key: "snap", text: "Se le va la pinza: en su siguiente turno ataca a la persona más cercana, aliada o enemiga, con lo que tenga a mano." };
  return { key: "absorbed", text: "Absorto: pierde su turno y no puede reaccionar hasta que alguien le sacuda o termine la escena." };
}

/** Duración (margen): 1 round + 1 per 3 points of incoming damage. */
export function marginDuration(incoming) {
  return 1 + Math.floor(Math.max(0, Number(incoming) || 0) / 3);
}

export function hackRequirementMet(actor, hack) {
  const required = Number(hack.system.requirement || 0);
  if (!required) return true;
  return Number(actor.system.skills?.hacking?.value ?? actor.system.skills?.hacking?.die ?? 0) >= required;
}
