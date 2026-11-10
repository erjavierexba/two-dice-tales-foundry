import { DIE_SIZES } from "../dice.mjs";

/** Split the larger side as evenly as possible while preserving player/enemy alternation. */
export function distributeTeamOrder(heroes, enemies, heroesFirst = true) {
  const players = [...heroes];
  const foes = [...enemies];
  const order = [];
  if (!players.length) return foes;
  if (!foes.length) return players;

  if (!heroesFirst) order.push(foes.shift());
  for (let index = 0; index < players.length; index++) {
    order.push(players[index]);
    const playerSlots = players.length - index;
    const take = Math.ceil(foes.length / playerSlots);
    order.push(...foes.splice(0, take));
  }
  order.push(...foes);
  return order;
}

export function initiativeDice(actor, source = "perception") {
  if (!actor) return [0, 0];
  if (source === "perception") {
    const faces = Number(actor.system.perception?.faces || actor.system.perception?.die || 4);
    return [faces, faces];
  }
  const skill = actor.system.skills?.[source];
  const attribute = actor.system.attributes?.[skill?.attribute];
  return [Number(attribute?.value || attribute?.die || 4), Number(skill?.value || skill?.die || 0)];
}

export function bestInitiativeCombatant(combatants, source = "perception") {
  const score = combatant => initiativeDice(combatant.actor, source)
    .sort((a, b) => b - a)
    .map(faces => Math.max(0, DIE_SIZES.indexOf(faces) + 1));
  return [...combatants].filter(combatant => combatant.actor).sort((a, b) => {
    const left = score(a);
    const right = score(b);
    return (right[0] - left[0]) || (right[1] - left[1]) || a.name.localeCompare(b.name, "es");
  })[0] ?? null;
}
