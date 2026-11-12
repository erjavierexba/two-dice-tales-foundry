/* global game, ui, Actor, ChatMessage, foundry */
// Utilidades que se inyectan en la página de Foundry (window.T) para las pruebas e2e.
(() => {
  const T = {};
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  T.sleep = sleep;

  /* ---------- Dados trucados ---------- */
  T.queue = [];
  T.rolled = [];
  T.unexpected = 0;
  const Die = foundry.dice.terms.Die;
  if (!Die.prototype.__tdtPatched) {
    const original = Die.prototype.randomFace;
    Die.prototype.randomFace = function () {
      if (!T.queue.length) {
        T.unexpected++;
        const value = original.call(this);
        T.rolled.push({ faces: this.faces, value, random: true });
        return value;
      }
      const next = T.queue.shift();
      const [faces, value] = Array.isArray(next) ? next : [null, next];
      if (faces && faces !== this.faces) throw new Error(`Se esperaba un d${faces} y se ha tirado un d${this.faces}`);
      T.rolled.push({ faces: this.faces, value });
      return value;
    };
    Die.prototype.__tdtPatched = true;
  }
  /** Queue die results: numbers, or [faces, value] to also check which die is rolled. */
  T.dice = (...values) => {
    T.queue = values;
    T.rolled = [];
    T.unexpected = 0;
  };
  T.diceDone = () => {
    if (T.queue.length) throw new Error(`Quedan dados sin usar: ${JSON.stringify(T.queue)} (tirados: ${JSON.stringify(T.rolled)})`);
    if (T.unexpected) throw new Error(`Se han tirado ${T.unexpected} dados no previstos: ${JSON.stringify(T.rolled)}`);
  };

  /* ---------- Aserciones ---------- */
  T.eq = (actual, expected, label = "") => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${label}: esperaba ${e} y es ${a}`);
  };
  T.ok = (value, label = "") => {
    if (!value) throw new Error(`${label}: no se cumple`);
  };

  T.hero = (overrides = {}) => ({
    attributes: { power: { die: 6 }, dexterity: { die: 6 }, mind: { die: 6 }, social: { die: 4 } },
    ...overrides
  });
  T.renderSheet = async (sheet, label) => {
    sheet.render({ force: true });
    const start = Date.now();
    while (!sheet.rendered && Date.now() - start < 5000) await sleep(50);
    T.ok(sheet.rendered, label);
  };

  /* ---------- Notificaciones ---------- */
  T.notes = [];
  if (!ui.notifications.__tdtPatched) {
    const notify = ui.notifications.notify.bind(ui.notifications);
    ui.notifications.notify = (message, type, options) => {
      T.notes.push({ type, message: String(message) });
      try { return notify(message, type, options); } catch (error) { return null; }
    };
    ui.notifications.__tdtPatched = true;
  }

  /* ---------- Documentos ---------- */
  T.created = [];
  T.actor = async (type, system = {}, name = `E2E ${type}`) => {
    const actor = await Actor.create({ name, type, system });
    T.created.push(actor);
    return actor;
  };
  T.packItem = async (pack, name) => {
    const collection = game.packs.get(`tdt.${pack}`);
    if (!collection) throw new Error(`No existe el compendio tdt.${pack}`);
    const index = await collection.getIndex();
    const entry = index.find(item => item.name === name);
    if (!entry) throw new Error(`No existe «${name}» en tdt.${pack}`);
    return (await collection.getDocument(entry._id)).toObject();
  };
  T.give = async (actor, pack, name, changes = {}) => {
    const data = await T.packItem(pack, name);
    foundry.utils.mergeObject(data, changes);
    const [item] = await actor.createEmbeddedDocuments("Item", [data]);
    return item;
  };
  T.cleanup = async () => {
    for (const actor of T.created.splice(0)) if (game.actors.get(actor.id)) await actor.delete();
    await ChatMessage.deleteDocuments(game.messages.map(message => message.id));
    T.targets([]);
    // Cerrar sin esperar a la animación (en Chrome sin ventana puede no terminar nunca).
    for (const app of openDialogs()) await Promise.race([app.close({ force: true }), sleep(200)]);
  };

  /* ---------- Objetivos (sin canvas: el sistema solo lee token.actor) ---------- */
  T.targets = actors => {
    Set.prototype.clear.call(game.user.targets);
    for (const actor of actors) Set.prototype.add.call(game.user.targets, { actor, id: actor.id, document: { actor } });
  };

  /* ---------- Diálogos ---------- */
  const DialogV2 = foundry.applications.api.DialogV2;
  const openDialogs = () => [...foundry.applications.instances.values()].filter(app => app instanceof DialogV2 && app.rendered);
  T.openDialogIds = () => new Set(openDialogs().map(app => app.id));
  T.waitDialog = async (seen = new Set(), timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const dialog = openDialogs().find(app => !seen.has(app.id) && app.element?.querySelector(".form-footer"));
      if (dialog) return dialog;
      await sleep(25);
    }
    throw new Error(`No apareció ningún diálogo (abiertos: ${openDialogs().map(app => app.title).join(", ") || "ninguno"})`);
  };
  /**
   * Answers the next dialog: checks/unchecks rule boxes by label text, fills fields and presses a button.
   * @returns the dialog's title, the labels of its rules and the reminders.
   */
  T.answer = async ({ check = [], uncheck = [], fields = {}, button = null, seen } = {}) => {
    const dialog = await T.waitDialog(seen);
    const root = dialog.element;
    const labels = [...root.querySelectorAll(".tdt-roll-feats label")];
    const rules = labels.map(label => ({ text: label.textContent.trim().replace(/\s+/g, " "), checked: label.querySelector("input").checked }));
    const find = text => {
      const label = labels.find(entry => entry.textContent.includes(text));
      if (!label) throw new Error(`No hay ninguna regla «${text}» en el diálogo «${dialog.title}». Reglas: ${rules.map(rule => rule.text).join(" | ")}`);
      return label.querySelector("input");
    };
    for (const text of check) find(text).checked = true;
    for (const text of uncheck) find(text).checked = false;
    for (const [name, value] of Object.entries(fields)) {
      const input = root.querySelector(`[name="${name}"]`);
      if (!input) throw new Error(`El diálogo «${dialog.title}» no tiene el campo ${name}`);
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
    }
    const buttons = [...root.querySelectorAll(".form-footer button")];
    const target = button ? buttons.find(entry => entry.dataset.action === button || entry.textContent.trim() === button) : buttons[0];
    if (!target) throw new Error(`El diálogo «${dialog.title}» no tiene el botón ${button}: ${buttons.map(entry => entry.dataset.action).join(", ")}`);
    const info = { title: dialog.title, rules, reminders: [...root.querySelectorAll(".tdt-roll-reminders p")].map(p => p.textContent.trim()) };
    target.click();
    await sleep(50);
    return info;
  };
  /** Runs an action that opens a roll dialog, answers it and returns { value, dialog }. */
  T.roll = async (action, answer = {}) => {
    const seen = T.openDialogIds();
    const promise = action();
    const dialog = await T.answer({ ...answer, seen });
    const value = await promise;
    return { value, dialog };
  };

  /* ---------- Chat ---------- */
  T.lastMessage = () => game.messages.contents.at(-1);
  T.messageText = message => (message?.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  T.chatButton = async (message, action) => {
    await sleep(100);
    const element = document.querySelector(`#chat-log [data-message-id="${message.id}"] [data-tdt-action="${action}"]`)
      ?? document.querySelector(`[data-message-id="${message.id}"] [data-tdt-action="${action}"]`);
    if (!element) throw new Error(`El mensaje no tiene el botón ${action}: ${T.messageText(message)}`);
    return element;
  };

  window.T = T;
})();
