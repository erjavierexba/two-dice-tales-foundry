import { TDTActor } from "./actor.mjs";
import { esc } from "./chat.mjs";
import { confirmDialog } from "./dialogs.mjs";
import { dieLabel, halfCostSkills, improvementOptions, previousDie } from "./experience.mjs";
import { skillVisible } from "./settings.mjs";

const card = (title, body) => `<div class="tdt-chat-card"><header>${esc(title)}</header>${body}</div>`;
const KIND_PATH = { attribute: "attributes", defense: "defenses", skill: "skills" };

const methods = {
  /** Every characteristic, defensive die and visible skill with the cost of its next die. */
  experienceOptions() {
    const system = this.system;
    const skills = Object.fromEntries(Object.entries(system.skills).filter(([key]) => skillVisible(key)));
    return improvementOptions({
      attributes: system.attributes,
      defenses: system.defenses,
      skills,
      available: Number(system.experience?.value || 0),
      half: halfCostSkills({ items: this.items, flags: this.tdtFlags })
    });
  },

  /**
   * Raises one die by spending experience. Refuses when it is not affordable or already d12.
   * @param {"attribute"|"defense"|"skill"} kind
   * @param {string} key
   * @param {{confirm?: boolean}} [options]  Ask before spending (the per-stat buttons of the sheet).
   */
  async improve(kind, key, { confirm = false } = {}) {
    if (this.type !== "character") return null;
    const option = this.experienceOptions().find(entry => entry.kind === kind && entry.key === key);
    if (!option) return null;
    if (option.max) return ui.notifications.warn(`${option.label} ya está en d12.`);
    const available = Number(this.system.experience.value || 0);
    if (!option.affordable) return ui.notifications.warn(`Subir ${option.label} a d${option.next} cuesta ${option.cost} XP y solo tienes ${available}.`);
    if (confirm) {
      const ok = await confirmDialog("Mejorar", `<p>¿Subir <strong>${esc(option.label)}</strong> de ${dieLabel(option.die)} a <strong>d${option.next}</strong> por <strong>${option.cost} XP</strong>${option.half ? " (mitad de coste)" : ""}?</p><p class="hint">Te quedarán ${available - option.cost} XP.</p>`, { yes: "Mejorar", no: "Cancelar" });
      if (!ok) return null;
    }
    const log = [...(this.system.experience.log ?? []), { kind, key, label: option.label, from: option.die, to: option.next, cost: option.cost, time: Date.now() }];
    await this.update({
      [`system.${KIND_PATH[kind]}.${key}.die`]: option.next,
      "system.experience.value": available - option.cost,
      "system.experience.spent": Number(this.system.experience.spent || 0) + option.cost,
      "system.experience.log": log
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: card(`${this.name} mejora`, `<p><strong>${esc(option.label)}</strong>: ${dieLabel(option.die)} → <strong>d${option.next}</strong> (${option.cost} XP). Quedan ${available - option.cost} XP.</p>`)
    });
    return option;
  },

  /**
   * Adds a feat paying its cost in experience (a disadvantage gives its cost back instead).
   * The usual requirement checks still apply: if the feat can't be added, nothing is spent.
   */
  async buyFeat(data) {
    if (this.type !== "character") return null;
    const cost = Number(data.system?.cost || 0);
    const available = Number(this.system.experience.value || 0);
    if (cost > available) {
      ui.notifications.warn(`${data.name} cuesta ${cost} XP y solo tienes ${available}.`);
      return null;
    }
    const copy = foundry.utils.deepClone(data);
    delete copy._id;
    const [created] = await this.createEmbeddedDocuments("Item", [copy]);
    if (!created) return null;
    const log = [...(this.system.experience.log ?? []), { kind: "feat", key: created.id, label: created.name, from: 0, to: 0, cost, time: Date.now() }];
    await this.update({
      "system.experience.value": available - cost,
      "system.experience.spent": Number(this.system.experience.spent || 0) + Math.max(0, cost),
      "system.experience.log": log
    });
    const text = cost >= 0 ? `cuesta ${cost} XP` : `da ${-cost} XP`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: card(`${this.name} adquiere una dote`, `<p><strong>${esc(created.name)}</strong> (${text}). Quedan ${available - cost} XP.</p>`)
    });
    return created;
  },

  /** Undoes the last purchase of the history, if the sheet still matches it. */
  async undoExperience() {
    const log = [...(this.system.experience?.log ?? [])];
    const last = log.at(-1);
    if (!last) return ui.notifications.info("No hay compras de experiencia que deshacer.");
    const available = Number(this.system.experience.value || 0);
    const updates = {};
    if (last.kind === "feat") {
      if (last.cost < 0 && available < -last.cost) return ui.notifications.warn(`Quitar ${last.label} devuelve ${-last.cost} XP que ya has gastado.`);
    } else {
      const path = `${KIND_PATH[last.kind]}.${last.key}`;
      const current = Number(foundry.utils.getProperty(this.system, `${path}.die`) || 0);
      if (current !== Number(last.to)) return ui.notifications.warn(`${last.label} ya no es d${last.to}: no se puede deshacer automáticamente.`);
      updates[`system.${path}.die`] = previousDie(last.kind, current);
    }
    const ok = await confirmDialog("Deshacer compra", `<p>¿Deshacer <strong>${esc(last.label)}</strong>${last.kind === "feat" ? "" : ` (d${last.to} → ${dieLabel(previousDie(last.kind, last.to))})`} y ${last.cost >= 0 ? `recuperar ${last.cost} XP` : `devolver ${-last.cost} XP`}?</p>`, { yes: "Deshacer", no: "Cancelar" });
    if (!ok) return null;
    log.pop();
    updates["system.experience.value"] = available + Number(last.cost);
    updates["system.experience.spent"] = Math.max(0, Number(this.system.experience.spent || 0) - Math.max(0, Number(last.cost)));
    updates["system.experience.log"] = log;
    if (last.kind === "feat" && this.items.has(last.key)) await this.deleteEmbeddedDocuments("Item", [last.key]);
    await this.update(updates);
    return last;
  },

  /** Ends character creation: from now on dice only change by spending experience. */
  async finishCreation() {
    if (this.type !== "character") return null;
    const report = this.creationReport();
    if (report.issues.length) {
      const ok = await confirmDialog("Terminar creación", `<p>La comprobación encuentra problemas:</p><ul>${report.issues.map(issue => `<li>${esc(issue)}</li>`).join("")}</ul><p>¿Terminar la creación de todas formas?</p>`, { yes: "Terminar", no: "Revisar" });
      if (!ok) return null;
    }
    await this.update({ "system.creation.done": true });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: card(`${this.name}: creación terminada`, "<p>A partir de ahora los dados se suben con experiencia desde «Mejorar».</p>")
    });
  },

  /** Only the GM can reopen creation (to fix a sheet by hand). */
  async reopenCreation() {
    if (!game.user.isGM) return ui.notifications.warn("Solo el DJ puede reabrir la creación de un personaje.");
    return this.update({ "system.creation.done": false });
  }
};

for (const [name, fn] of Object.entries(methods)) {
  Object.defineProperty(TDTActor.prototype, name, { value: fn, writable: true, configurable: true });
}
