import { TDT } from "./config.mjs";
import { TDTActor } from "./actor.mjs";
import { TDTCombat } from "./combat.mjs";
import { TDTTokenDocument } from "./token.mjs";
import "./actor-modules.mjs";
import { TDTActorSheet, TDTItemSheet, TDTMechaSheet } from "./sheets.mjs";
import * as dice from "./dice.mjs";
import { importBasicContent, importContent, packEnabled } from "./content.mjs";
import { activeModules, moduleActive, registerSettings, rule } from "./settings.mjs";
import { activateChatListeners, registerSocket } from "./chat.mjs";

Hooks.once("init", () => {
  console.log("TDT | Inicializando Two Dice Tales");
  CONFIG.TDT = TDT;
  CONFIG.Actor.documentClass = TDTActor;
  CONFIG.Combat.documentClass = TDTCombat;
  CONFIG.Token.documentClass = TDTTokenDocument;
  registerSettings();

  const Actors = foundry.documents.collections.Actors;
  const Items = foundry.documents.collections.Items;
  Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  Actors.registerSheet("tdt", TDTActorSheet, { types: ["character", "npc"], makeDefault: true, label: "Ficha de TDT" });
  Actors.registerSheet("tdt", TDTMechaSheet, { types: ["mecha"], makeDefault: true, label: "Ficha de mecha de TDT" });
  Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  Items.registerSheet("tdt", TDTItemSheet, { types: Object.keys(TDT.itemTypes), makeDefault: true, label: "Objeto de TDT" });

  // Labels of the document types in the creation dialogs.
  CONFIG.Actor.typeLabels = { character: "Personaje", npc: "PNJ", mecha: "Mecha" };
  CONFIG.Item.typeLabels = { ...TDT.itemTypes };

  game.tdt = {
    config: TDT,
    dice,
    importContent,
    importBasicContent,
    moduleActive,
    rule
  };
});

/** Hide the actor and item types of disabled modules in the creation dialog. */
Hooks.on("preCreateActor", (actor, data, options, userId) => {
  if (actor.type === "mecha" && !moduleActive("mecha") && game.user.id === userId) {
    ui.notifications.warn("El tipo Mecha necesita el módulo de mechas activo en la configuración.");
    return false;
  }
  return true;
});

Hooks.once("ready", () => {
  registerSocket();
  if (!game.user.isGM) return;
  const modules = activeModules();
  if (game.settings.get("tdt", "welcomeShown")) return;
  game.settings.set("tdt", "welcomeShown", true);
  ChatMessage.create({
    whisper: [game.user.id],
    content: `<div class="tdt-chat-card tdt-welcome"><header class="tdt-welcome-brand"><img src="systems/tdt/assets/branding/tdt-mark.svg" alt=""><span>Two Dice Tales<small>Un sistema · infinitas historias</small></span></header>
      <p>El sistema está listo. Crea un <strong>Actor</strong> de tipo Personaje o PNJ y pulsa los dados de su ficha para empezar.</p>
      <p>Los módulos opcionales (fantástico, mechas, superpoderes, zombis y cyberpunk) y las reglas opcionales se activan en <em>Configuración → Configurar ajustes → Two Dice Tales</em>.${modules.length ? ` Activos: ${modules.map(key => TDT.modules[key]).join(", ")}.` : ""}</p>
      <p>Todo el contenido está en los compendios. Si prefieres tenerlo en el mundo:</p>
      <button type="button" class="tdt-chat-button" data-tdt-action="import-content"><i class="fas fa-box-open"></i> Importar contenido de los módulos activos</button></div>`
  });
});

Hooks.on("renderChatMessageHTML", (message, html) => activateChatListeners(message, html));

/**
 * Compendiums of disabled modules are hidden from the sidebar. A class (not an inline style) is used
 * because Foundry's search filter rewrites the inline display of every entry after rendering.
 */
Hooks.on("renderCompendiumDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  for (const pack of game.packs) {
    const hidden = !packEnabled(pack);
    for (const element of root.querySelectorAll(`[data-pack="${pack.collection}"], [data-entry-id="${pack.collection}"]`)) element.classList.toggle("tdt-hidden", hidden);
  }
  for (const folder of root.querySelectorAll(".directory-item.folder")) {
    const entries = [...folder.querySelectorAll(".directory-item:not(.folder)")];
    folder.classList.toggle("tdt-hidden", entries.length > 0 && entries.every(element => element.classList.contains("tdt-hidden")));
  }
});

/** Accelerated bone marrow: regenerates 1 HP at the start of the turn while under 5 (7 with the upgrade). */
Hooks.on("updateCombat", async (combat, changes) => {
  if (!("turn" in changes || "round" in changes)) return;
  if (!game.users.activeGM?.isSelf || !moduleActive("cyber")) return;
  const actor = combat.combatant?.actor;
  if (!actor || actor.type === "mecha") return;
  const flags = actor.tdtFlags;
  if (!flags.has("marrow")) return;
  const cap = flags.has("marrowHigh") ? 7 : 5;
  const health = Number(actor.system.health.value);
  if (health <= 0 || health >= cap) return;
  await actor.update({ "system.health.value": health + 1 });
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="tdt-chat-card"><header>Médula ósea acelerada</header><p>${foundry.utils.escapeHTML(actor.name)} regenera 1 PV (${health + 1}/${cap}).</p></div>`
  });
});

/** Starting a new combat resets the once-per-combat villain turn. */
Hooks.on("combatStart", async combat => {
  if (!game.users.activeGM?.isSelf) return;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (actor?.type === "npc" && actor.system.npcStats?.villain?.extraTurnUsed) await actor.update({ "system.npcStats.villain.extraTurnUsed": false });
  }
});
