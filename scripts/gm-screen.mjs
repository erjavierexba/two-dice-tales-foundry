/**
 * GM screen: the quick reference of the manual plus the rules of the active modules and optional rules,
 * the party at a glance (XP, rests) and counters ("relojes": plan maestro, alarmas, persecuciones…).
 * Opened from a macro or with game.tdt.gmScreen().
 */
import { TDT } from "./config.mjs";
import { RULE_SETTINGS, moduleActive, rule } from "./settings.mjs";
import { numberDialog, tdtDialog } from "./dialogs.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const SYSTEM = "tdt";
const esc = value => foundry.utils.escapeHTML(String(value ?? ""));

export function registerGMScreenSettings() {
  game.settings.register(SYSTEM, "counters", {
    name: "Contadores de la pantalla del DJ",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
}

const table = (head, rows) => ({ head, rows });
const capitalize = text => text.charAt(0).toLocaleUpperCase("es") + text.slice(1);

/** Reference sections, adapted to the modules and optional rules in use. */
export function referenceSections() {
  const core = [
    { title: "Dificultades", icon: "fa-gauge", table: table(["Perfil", "Muy fácil", "Fácil", "Normal", "Difícil", "Muy difícil"], [
      ["Persona común", 2, 3, 4, 6, 8],
      ["Profesional", 4, 6, 7, 9, 11],
      ["Experto", 7, 9, 11, 13, 15],
      ["Élite mundial", 11, 12, 14, 16, 18]
    ]) },
    { title: "Tiradas", icon: "fa-dice", table: table(["Situación", "Regla"], [
      ["Tirada", "Característica + habilidad. Sin dado de habilidad, suma 1."],
      ["Crítico", "Dobles (salvo 1): suma ese número otra vez."],
      ["Pifia", "Doble 1: fallo grave (DJ)."],
      ["Bonifica X", "Reparte X entre los dados tras tirar. No sobre un 1 ni por encima del máximo. Tope +3."],
      ["Penaliza X", "Resta X al final. Sin tope."],
      ["Orden", "Aumentos/reducciones de dado se anulan → tirar → bonificar → crítico → penalizar."]
    ]) },
    { title: "Combate", icon: "fa-crosshairs", table: table(["Paso", "Regla"], [
      ["Iniciativa", "Tira el mejor del grupo; cada aliado bonifica 1 (máx. 3). Enemigos: dificultad fija +1 por enemigo extra (máx. +3)."],
      ["Atacar", "Contra Esquiva, Fortaleza o Voluntad. Igualar basta: el agresor gana los empates."],
      ["Daño", "Entrante (exceso) + Daño del arma − Aguante. Pifia al defenderse: ignora el aguante."],
      ["Ataque múltiple", `Jugadores: la habilidad baja un paso por ataque extra (hasta d4). Enemigos: −${Number(rule("enemyMultiAttack")) || 2} de dificultad por ataque, no por debajo de 3.`],
      ["Caído", "A 0 PV, el daño sobrante es la dificultad. Fortaleza cada turno: éxito −2, fallo +2. 0–1 estable, 10–11 muerte."],
      ["Ayudar", "Tarea sencilla: bonifica 1. Compleja: el ayudante tira a −4; éxito bonifica 1, fallo penaliza 1."],
      ["Cobertura", "Reduce la dificultad de Esquiva o Fortaleza: ligera 1, mediana 3, total 5."],
      ["Descanso", "Cura 1 PV; +1 si te tratan, +1 si quien trata tiene Manos sanadoras."]
    ]) },
    { title: "Distancias", icon: "fa-ruler", table: table(["Contacto", "Muy corta", "Corta", "Media", "Media-larga", "Larga", "Muy larga", "Extrema"], [["CaC", "3 m", "6 m", "12 m", "30 m", "60 m", "240 m", "2 km"]]) },
    { title: "Villanos y punto de héroe", icon: "fa-skull", table: table(["Recurso", "Regla"], [
      ["Fuente de villano (8–20)", "1 punto: +2 a una dificultad. 2: +4 a una defensa o al aguante. 3: turno extra (una vez por combate)."],
      ["Escape magistral", "Con al menos 4 puntos, el villano escapa; el resto queda como dificultad para perseguirlo."],
      ["Punto de héroe (máx. 1)", "Quedarse a 1 PV, bonifica 2 sin tope, repetir dados o añadir un elemento favorable a la escena."]
    ]) }
  ];

  const optional = Object.entries(RULE_SETTINGS)
    .filter(([key, data]) => {
      const value = rule(key);
      if (key === "enemyMultiAttack" || key === "advancedCreation") return key === "advancedCreation" && value !== "normal";
      if (key.startsWith("magic") || key === "races") return false;
      if (["mechanime", "mechaModuleLimit", "mechaDamage"].includes(key) && !moduleActive("mecha")) return false;
      if (key === "weakPoint" && !moduleActive("powers")) return false;
      if (key === "zombieTerror" && !moduleActive("zombie")) return false;
      if (key === "cyberReputation" && !moduleActive("cyber")) return false;
      if (key === "mechaModuleLimit") return Number(value) < 12;
      return Boolean(value);
    })
    .map(([key, data]) => [capitalize(data.name.replace(/^(Opcional|Mechas|Superpoderes|Zombis|Cyberpunk): /, "")), key === "mechaModuleLimit" ? `Módulos hasta d${rule(key)}.` : data.hint]);

  const modules = [];
  if (moduleActive("fantasy")) {
    const modes = { simple: "magia sencilla", circles: "círculos mágicos", both: "magia sencilla o círculos (cada personaje elige)" };
    modules.push({ title: TDT.modules.fantasy, icon: "fa-wand-sparkles", table: table(["Aspecto", "En esta partida"], [
      ["Magia", modes[rule("magicMode")] ?? rule("magicMode")],
      ["Razas", rule("races") ? "Sí: 5 incrementos de habilidad menos y 10 XP más al crear." : "No."]
    ]) });
  }
  if (moduleActive("mecha")) {
    modules.push({ title: `${TDT.modules.mecha}: categorías`, icon: "fa-robot", table: table(["Cat.", "PV", "Aguante", "Robustez", "Maniobra", "Inventario"],
      Object.entries(TDT.mechaCategories).map(([key, data]) => [key, data.health, data.endurance, `d${data.robustness}`, `d${data.maneuver}`, data.inventory])) });
    if (rule("mechaDamage")) modules.push({ title: "Daños en el mecha (1d8)", icon: "fa-burst", note: "Cuando pierde al menos 6 + 2 × categoría PV de un golpe o pifia defendiendo.", table: table(["1d8", "Efecto"], Object.entries(TDT.mechaDamageTable)) });
  }
  if (moduleActive("powers") && rule("weakPoint")) modules.push({ title: TDT.modules.powers, icon: "fa-bolt", table: table(["Regla", "Efecto"], [["Punto débil", RULE_SETTINGS.weakPoint.hint]]) });
  if (moduleActive("zombie")) {
    modules.push({ title: "Zombificación", icon: "fa-biohazard", table: table(["Nivel", "Efecto"], Object.entries(TDT.zombification)) });
    modules.push({ title: "Hambruna", icon: "fa-utensils", table: table(["Nivel", "Efecto"], Object.entries(TDT.hunger)) });
  }
  if (moduleActive("cyber")) {
    const removal = TDT.implantRemovalDifficulty ?? {};
    modules.push({ title: TDT.modules.cyber, icon: "fa-microchip", table: table(["Regla", "Efecto"], [
      ["Compatibilidad (CC)", "10 + puntuación de Social × 5. Implantes: menor 2–3, moderado 4–6, mayor 7–9, extremo 10–12."],
      ["Exceso de carga", "Voluntad contra 4 + exceso. Fallo: absorto (pierde el turno). Fallo por 4 o más, o pifia: ataca al más cercano."],
      ["Desalineado", "Con exceso 10 o más, fallar cualquier tirada de exceso: el personaje pasa al DJ. No hay vuelta atrás."],
      ["Quitar implantes", `Cibernética contra ${[removal.minor, removal.moderate, removal.major, removal.extreme].filter(Boolean).join("/")} según el tipo.`],
      ["Defensas de hacks", Object.values(TDT.hackDefenses).join(", ") + ". Enemigos contra intrusión: su Hacking, o 4."]
    ]) });
  }
  return { core, optional, modules };
}

/** Characters of the players (or every character if nobody has one assigned). */
function partyActors() {
  const characters = game.actors.filter(actor => actor.type === "character");
  const owned = characters.filter(actor => actor.hasPlayerOwner);
  return owned.length ? owned : characters;
}

export function counters() {
  try {
    return foundry.utils.deepClone(game.settings.get(SYSTEM, "counters") ?? []);
  } catch {
    return [];
  }
}

async function saveCounters(list) {
  return game.settings.set(SYSTEM, "counters", list);
}

export class TDTGMScreen extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tdt-gm-screen",
    classes: ["tdt", "tdt-gm-screen-window"],
    position: { width: 940, height: 720 },
    window: { title: "Pantalla del DJ", icon: "fas fa-book-open-reader", resizable: true },
    actions: {
      "gm-tab": function (event, target) {
        this._tab = target.dataset.tab;
        this.render();
      },
      "party-xp": function (event, target) { return this._giveXp(target.dataset.uuid); },
      "party-scene": function () { return this._forParty(actor => actor.newScene(), "Descanso pequeño"); },
      "party-rest": function () { return this._forParty(actor => actor.rest({ treated: false }), "Descanso"); },
      "party-open": function (event, target) { return fromUuidSync(target.closest("[data-uuid]")?.dataset.uuid)?.sheet.render({ force: true }); },
      "counter-add": function () { return this._addCounter(); },
      "counter-step": function (event, target) { return this._stepCounter(target.closest("[data-counter]").dataset.counter, Number(target.dataset.step)); },
      "counter-delete": function (event, target) { return this._deleteCounter(target.closest("[data-counter]").dataset.counter); },
      "counter-chat": function (event, target) { return this._postCounter(target.closest("[data-counter]").dataset.counter); }
    }
  };

  static PARTS = {
    screen: { template: "systems/tdt/templates/gm-screen.hbs", scrollable: [".tdt-gm-body"] }
  };

  static open() {
    if (!game.user.isGM) return ui.notifications.warn("La pantalla del DJ es solo para el DJ.");
    const existing = foundry.applications.instances.get("tdt-gm-screen");
    if (existing) return existing.render({ force: true });
    return new TDTGMScreen().render({ force: true });
  }

  _tab = "rules";

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sections = referenceSections();
    const tabs = [
      { key: "rules", label: "Reglas", icon: "fa-book" },
      { key: "game", label: "Esta partida", icon: "fa-sliders", count: sections.optional.length + sections.modules.length },
      { key: "table", label: "Mesa", icon: "fa-users" }
    ];
    context.tabs = tabs.map(tab => ({ ...tab, active: tab.key === this._tab }));
    context.tab = this._tab;
    context.core = sections.core;
    context.optional = sections.optional;
    context.modules = sections.modules;
    context.activeModules = Object.entries(TDT.modules).filter(([key]) => moduleActive(key)).map(([, label]) => label);
    context.party = partyActors().map(actor => ({
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      health: `${actor.system.health.value}/${actor.system.health.effectiveMax ?? actor.system.health.max}`,
      xp: Number(actor.system.experience?.value || 0),
      hero: Number(actor.system.heroPoint || 0) > 0,
      dying: Boolean(actor.system.dying?.active)
    }));
    context.counters = counters().map(counter => ({ ...counter, percent: Math.round((Number(counter.value) / Math.max(1, Number(counter.max))) * 100), segments: Array.from({ length: Math.min(20, Number(counter.max) || 0) }, (_, index) => index < Number(counter.value)) }));
    return context;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const refresh = () => this.rendered && this.render();
    this._hooks = [
      ["updateActor", Hooks.on("updateActor", actor => actor.type === "character" && refresh())],
      ["updateSetting", Hooks.on("updateSetting", setting => setting.key?.startsWith(`${SYSTEM}.`) && refresh())]
    ];
  }

  _onClose(options) {
    super._onClose?.(options);
    for (const [hook, id] of this._hooks ?? []) Hooks.off(hook, id);
    this._hooks = [];
  }

  /** XP for one character (uuid) or for the whole party. */
  async _giveXp(uuid) {
    const targets = uuid ? [fromUuidSync(uuid)].filter(Boolean) : partyActors();
    if (!targets.length) return;
    const amount = await numberDialog("Dar experiencia", `${uuid ? targets[0].name : "Todo el grupo"}: XP (sesión corta 3–5, normal 5–7, clímax 6–10)`, 5);
    if (!amount) return;
    for (const actor of targets) await actor.update({ "system.experience.value": Number(actor.system.experience?.value || 0) + amount });
    return ChatMessage.create({ content: `<div class="tdt-chat-card"><header>Experiencia</header><p>${targets.map(actor => esc(actor.name)).join(", ")}: <strong>${amount > 0 ? "+" : ""}${amount} XP</strong>.</p></div>` });
  }

  async _forParty(fn, label) {
    const party = partyActors();
    if (!party.length) return ui.notifications.info("No hay personajes jugadores.");
    for (const actor of party) await fn(actor);
    ui.notifications.info(`${label}: ${party.map(actor => actor.name).join(", ")}.`);
  }

  async _addCounter() {
    const data = await tdtDialog({
      title: "Nuevo contador",
      content: `<div class="form-group"><label>Nombre</label><input type="text" name="name" placeholder="Plan maestro, alarma, persecución…" autofocus></div>
        <div class="form-group"><label>Segmentos</label><input type="number" name="max" value="6" min="1" max="20"></div>`,
      buttons: [
        { action: "ok", label: "Crear", icon: "fas fa-plus", default: true, callback: form => ({ name: form.elements.name.value.trim() || "Contador", max: Math.max(1, Math.min(20, Number(form.elements.max.value) || 6)) }) },
        { action: "cancel", label: "Cancelar" }
      ]
    });
    if (!data) return;
    return saveCounters([...counters(), { id: foundry.utils.randomID(), name: data.name, value: 0, max: data.max }]);
  }

  async _stepCounter(id, step) {
    const list = counters();
    const counter = list.find(entry => entry.id === id);
    if (!counter) return;
    counter.value = Math.max(0, Math.min(Number(counter.max), Number(counter.value) + step));
    await saveCounters(list);
    if (step > 0 && counter.value === Number(counter.max)) ChatMessage.create({ content: `<div class="tdt-chat-card"><header>${esc(counter.name)}</header><p>El contador se ha completado (${counter.value}/${counter.max}).</p></div>`, whisper: ChatMessage.getWhisperRecipients("GM") });
  }

  async _deleteCounter(id) {
    return saveCounters(counters().filter(entry => entry.id !== id));
  }

  async _postCounter(id) {
    const counter = counters().find(entry => entry.id === id);
    if (!counter) return;
    const bar = Array.from({ length: Number(counter.max) }, (_, index) => (index < counter.value ? "●" : "○")).join("");
    return ChatMessage.create({ content: `<div class="tdt-chat-card"><header>${esc(counter.name)}</header><p class="tdt-counter-text">${bar} ${counter.value}/${counter.max}</p></div>` });
  }
}
