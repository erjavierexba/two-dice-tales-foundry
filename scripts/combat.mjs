import { tdtDialog } from "./dialogs.mjs";
import { TDT } from "./config.mjs";
import { esc } from "./chat.mjs";
import { bestInitiativeCombatant, distributeTeamOrder, initiativeDice } from "./modules/combat.mjs";

const orderFlag = combatant => {
  const value = combatant.getFlag("tdt", "teamOrder");
  return value === null || value === undefined ? null : Number(value);
};

export function isHero(combatant) {
  // Las fichas de personaje y las de un jugador son siempre héroes: Foundry crea todos los tokens
  // como hostiles, así que la disposición no basta para descartarlos.
  if (combatant.actor?.type === "character") return true;
  if (combatant.actor?.hasPlayerOwner) return true;
  // PNJ y mechas: manda la disposición del token (un PNJ amistoso es un aliado).
  const disposition = combatant.token?.disposition;
  if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return true;
  if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) return false;
  if (combatant.actor?.type === "npc") return false;
  return !combatant.isNPC;
}

function availableSources(heroes) {
  const sources = [
    { id: "perception", label: "Percepción general" },
    { id: "perceptionVisual", label: "Percepción visual" },
    { id: "perceptionAuditory", label: "Percepción sonora" }
  ];
  for (const [id, label] of Object.entries(TDT.skills)) {
    if (heroes.some(combatant => Number(combatant.actor?.system.skills?.[id]?.value || 0) > 0)) sources.push({ id, label });
  }
  return sources;
}

function initiativeDialog(heroes, enemies, defaultLeader) {
  const configured = Math.max(0, ...enemies.map(combatant => Number(combatant.actor?.system.initiative?.value || 0)));
  const enemyBase = configured || 6;
  const sources = availableSources(heroes);
  return tdtDialog({
    title: "Iniciativa conjunta de TDT",
    content: `<div class="tdt-team-initiative">
      <p>Solo tira el integrante con los mejores dados. El resto aporta <strong>bonifica 1</strong>, hasta 3.</p>
      <div class="form-group"><label>Tirada del equipo</label><select name="source">${sources.map(source => `<option value="${source.id}">${esc(source.label)}</option>`).join("")}</select></div>
      <div class="form-group"><label>Primer héroe si gana el equipo</label><select name="firstHero">${heroes.map(combatant => `<option value="${combatant.id}" ${combatant.id === defaultLeader?.id ? "selected" : ""}>${esc(combatant.name)}</option>`).join("")}</select></div>
      ${enemies.length ? `<div class="form-group"><label>Iniciativa enemiga base</label><input type="number" name="enemyBase" min="0" value="${enemyBase}"><p class="hint">Se añadirá +1 por enemigo adicional, máximo +3.</p></div>` : ""}
    </div>`,
    buttons: [
      { action: "roll", label: "Tirar por el equipo", icon: "fas fa-users", default: true, callback: form => ({
        source: form.elements.source.value,
        firstHero: form.elements.firstHero.value,
        enemyBase: Number(form.elements.enemyBase?.value || 0)
      }) },
      { action: "cancel", label: "Cancelar" }
    ]
  });
}

export class TDTCombat extends Combat {
  _sortCombatants(a, b) {
    const left = orderFlag(a);
    const right = orderFlag(b);
    if (left !== null && right !== null) return (left - right) || (a.id > b.id ? 1 : -1);
    if (left !== null) return -1;
    if (right !== null) return 1;
    return super._sortCombatants(a, b);
  }

  async resetAll({ updateTurn = true } = {}) {
    const currentId = this.combatant?.id;
    const updates = this.combatants.map(combatant => ({
      _id: combatant.id,
      initiative: null,
      "flags.tdt.teamOrder": null,
      "flags.tdt.team": null,
      "flags.tdt.teamInitiative": null
    }));
    await this.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
    if (updateTurn && currentId) {
      this.setupTurns();
      await this.update({ turn: this.turns.findIndex(combatant => combatant.id === currentId) }, { turnEvents: false });
    }
    return this;
  }

  async rollInitiative(_ids, _options = {}) {
    if (!game.user.isGM) {
      ui.notifications.warn("La iniciativa de TDT es conjunta. El DJ debe pulsar «Tirar todos». ");
      return this;
    }
    const heroes = this.combatants.filter(isHero);
    const enemies = this.combatants.filter(combatant => !isHero(combatant));
    if (!heroes.length && !enemies.length) return this;
    if (!heroes.length) {
      ui.notifications.warn("No hay ningún héroe en el combate. Añade un personaje o marca como amistoso el token de los aliados.");
      return this;
    }

    const defaultLeader = bestInitiativeCombatant(heroes, "perception");
    const form = await initiativeDialog(heroes, enemies, defaultLeader);
    if (!form) return this;
    const leader = bestInitiativeCombatant(heroes, form.source);
    const allyBonus = Math.min(3, Math.max(0, heroes.length - 1));
    let heroScore = 0;
    if (leader?.actor) {
      const extraRules = allyBonus ? [{ type: "bonus", value: allyBonus, label: `${heroes.length - 1} aliados en la iniciativa conjunta` }] : [];
      const dice = initiativeDice(leader.actor, form.source);
      const label = `Iniciativa del equipo: ${leader.name} (${dice.filter(Boolean).map(faces => `d${faces}`).join(" + ")})`;
      const result = form.source.startsWith("perception")
        ? await leader.actor.rollPerception({ label, sense: form.source === "perceptionAuditory" ? "auditory" : form.source === "perceptionVisual" ? "visual" : "general", scopes: ["initiative"], extraRules })
        : await leader.actor.rollSkill(form.source, { label, scopes: ["initiative"], extraRules });
      if (!result) return this;
      heroScore = result.total;
    }
    const enemyBonus = Math.min(3, Math.max(0, enemies.length - 1));
    const enemyScore = Math.max(0, Number(form.enemyBase || 0)) + enemyBonus;
    const heroesFirst = heroes.length && (!enemies.length || heroScore >= enemyScore);

    const firstIndex = heroes.findIndex(combatant => combatant.id === form.firstHero);
    if (firstIndex > 0) heroes.unshift(...heroes.splice(firstIndex, 1));
    const order = distributeTeamOrder(heroes, enemies, heroesFirst);
    const updates = order.map((combatant, index) => {
      const team = isHero(combatant) ? "heroes" : "enemies";
      const score = team === "heroes" ? heroScore : enemyScore;
      return { _id: combatant.id, initiative: score, "flags.tdt.teamOrder": index, "flags.tdt.team": team, "flags.tdt.teamInitiative": score };
    });
    await this.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: leader?.actor }),
      content: `<div class="tdt-chat-card"><header>Iniciativa conjunta</header>
        <p><strong>Héroes ${heroScore}</strong> contra <strong>enemigos ${enemyScore}</strong>${enemyBonus ? ` (${form.enemyBase} + ${enemyBonus} por grupo)` : ""}.</p>
        <p>Empieza <strong>${heroesFirst ? "el equipo de héroes" : "el bando enemigo"}</strong>.</p>
        <ol class="tdt-initiative-order">${order.map(combatant => `<li>${esc(combatant.name)}</li>`).join("")}</ol></div>`
    });
    return this;
  }
}
