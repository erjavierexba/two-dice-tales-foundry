const SOCKET = "system.tdt";

export const esc = value => foundry.utils.escapeHTML(String(value ?? ""));

export function registerSocket() {
  game.socket.on(SOCKET, async data => {
    if (!game.user.isGM) return;
    const activeGM = game.users.activeGM;
    if (activeGM && activeGM.id !== game.user.id) return;
    if (data?.action === "applyDamage") {
      const actor = await fromUuid(data.actorUuid);
      const amount = Number(data.amount);
      if (!actor || actor.documentName !== "Actor" || !Number.isFinite(amount) || amount < 0 || amount > 1000) return;
      const options = sanitizeDamageOptions(data.options);
      const approved = await Dialog.confirm({
        title: "Solicitud de daño",
        content: `<p>¿Aplicar <strong>${amount}</strong> de daño a <strong>${esc(actor.name)}</strong>?</p><p class="hint">La solicitud procede de otro cliente y necesita confirmación del DJ.</p>`
      }, { classes: ["tdt", "tdt-dialog"] });
      if (approved) await actor.applyDamage(amount, options);
    }
  });
}

function sanitizeDamageOptions(options = {}) {
  const safe = {};
  for (const key of ["raw", "ignoreEndurance", "hack", "shot", "area", "armorBreak"]) safe[key] = Boolean(options[key]);
  const stun = Number(options.stun);
  if (Number.isFinite(stun) && stun >= 0 && stun <= 100) safe.stun = stun;
  if (Array.isArray(options.attackerFlags)) safe.attackerFlags = options.attackerFlags.filter(flag => typeof flag === "string").slice(0, 20);
  return safe;
}

/** Applies damage locally when possible, or asks the active GM through the socket. */
export async function requestDamage(actor, amount, options = {}) {
  if (!actor) return false;
  if (actor.isOwner) {
    await actor.applyDamage(amount, options);
    return true;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn("No hay ningún DJ conectado para aplicar el daño.");
    return false;
  }
  game.socket.emit(SOCKET, { action: "applyDamage", actorUuid: actor.uuid, amount, options });
  ui.notifications.info(`Solicitud de daño enviada al DJ para ${actor.name}.`);
  return true;
}

function actorFromCard(button) {
  const uuid = button.dataset.actorUuid;
  return uuid ? fromUuidSync(uuid) : null;
}

/** Wires every button of the TDT chat cards. */
export function activateChatListeners(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const applied = new Set(message.getFlag("tdt", "appliedActions") ?? []);
  [...root.querySelectorAll("[data-tdt-action]")].forEach((button, index) => {
    const actionId = `${button.dataset.tdtAction}:${index}`;
    if (applied.has(actionId)) button.disabled = true;
    button.addEventListener("click", async event => {
      event.preventDefault();
      const action = button.dataset.tdtAction;
      const data = button.dataset.payload ? JSON.parse(button.dataset.payload) : {};
      try {
        await handleChatAction(action, data, message, button, actionId);
      } catch (error) {
        console.error("TDT |", error);
        ui.notifications.error(error.message ?? String(error));
      }
    });
  });
}

async function handleChatAction(action, data, message, button, actionId) {
  switch (action) {
    case "apply-damage": {
      const target = await fromUuid(data.targetUuid);
      if (!target) return ui.notifications.warn("El objetivo ya no existe.");
      if (await requestDamage(target, data.amount, data.options ?? { raw: true })) await markChatAction(message, button, actionId);
      return;
    }
    case "defend": {
      const defenders = defendersFor(data);
      if (!defenders.length) return ui.notifications.warn("Selecciona o marca como objetivo un personaje que controles para defenderte.");
      for (const actor of defenders) await actor.defendAgainst(data);
      return;
    }
    case "reroll": {
      const flags = message.getFlag("tdt", "reroll");
      const actor = flags?.actorUuid ? await fromUuid(flags.actorUuid) : null;
      if (!actor?.isOwner) return ui.notifications.warn("Solo quien hizo la tirada puede repetirla.");
      return actor.rerollFromMessage(message);
    }
    case "dying": {
      const actor = actorFromCard(button);
      if (actor?.isOwner) return actor.rollDying();
      return;
    }
    case "orc-survive": {
      const actor = actorFromCard(button);
      if (actor?.isOwner) return actor.orcSurvive(data);
      return;
    }
    case "excess": {
      const actor = await fromUuid(data.targetUuid);
      if (actor?.isOwner) return actor.rollExcess();
      return ui.notifications.warn("Solo el dueño del personaje puede tirar su exceso de carga.");
    }
    case "drain-will": {
      const actor = await fromUuid(data.pilotUuid);
      if (actor?.isOwner) return actor.drainWill(data.difficulty ?? 8);
      return;
    }
    case "self-damage": {
      const actor = await fromUuid(data.actorUuid);
      if (actor && await requestDamage(actor, data.amount, { ignoreEndurance: true })) await markChatAction(message, button, actionId);
      return;
    }
    case "import-content":
      return game.user.isGM ? game.tdt.importContent() : ui.notifications.warn("Solo el DJ puede importar contenido.");
    default:
      return;
  }
}

async function markChatAction(message, button, actionId) {
  button.disabled = true;
  const applied = new Set(message.getFlag("tdt", "appliedActions") ?? []);
  applied.add(actionId);
  try {
    await message.setFlag("tdt", "appliedActions", [...applied]);
  } catch (error) {
    console.warn("TDT | No se pudo guardar el estado del botón de chat", error);
  }
}

function defendersFor(data) {
  const candidates = new Set();
  for (const token of canvas?.tokens?.controlled ?? []) if (token.actor) candidates.add(token.actor);
  for (const token of game.user.targets ?? []) if (token.actor?.isOwner) candidates.add(token.actor);
  if (!candidates.size && game.user.character) candidates.add(game.user.character);
  return [...candidates].filter(actor => actor.isOwner && actor.type !== "npc" && actor.uuid !== data.attackerUuid);
}

export function payload(data) {
  return esc(JSON.stringify(data));
}
