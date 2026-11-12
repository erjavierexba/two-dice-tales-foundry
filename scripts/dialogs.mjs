/**
 * Thin wrappers over DialogV2 shared by the whole system.
 *
 * Every dialog is a form: the content goes inside DialogV2's own <form>, so it must not contain a <form> tag.
 * Button callbacks receive that form and return the value of the dialog; closing it, or a button without
 * callback, resolves to null.
 */

const esc = value => foundry.utils.escapeHTML(String(value ?? ""));

/**
 * @param {object} config
 * @param {string} config.title
 * @param {string} config.content                         HTML of the body (no <form> tag).
 * @param {{action: string, label: string, icon?: string, default?: boolean, callback?: (form: HTMLFormElement, dialog: object) => any}[]} config.buttons
 * @param {(form: HTMLFormElement, dialog: object) => void} [config.render]  Called after the dialog renders.
 * @param {string[]} [config.classes]
 * @param {number} [config.width]
 * @returns {Promise<any>}
 */
export async function tdtDialog({ title, content, buttons, render, classes = [], width = 440 }) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const wrapped = buttons.map(button => ({
    action: button.action,
    label: button.label,
    icon: button.icon,
    default: button.default,
    disabled: button.disabled,
    // DialogV2 resolves to the action name when a callback returns undefined: box the value to tell them apart.
    callback: async (_event, element, dialog) => ({ tdtValue: button.callback ? await button.callback(element.form, dialog) : null })
  }));
  const result = await DialogV2.wait({
    window: { title },
    classes: ["tdt", "tdt-dialog", "themed", "theme-light", ...classes],
    position: { width },
    content,
    buttons: wrapped,
    render: render ? (_event, dialog) => render(dialog.element.querySelector("form"), dialog) : undefined,
    rejectClose: false
  });
  return result && typeof result === "object" && "tdtValue" in result ? result.tdtValue ?? null : null;
}

export function confirmDialog(title, html, { yes = "Sí", no = "No" } = {}) {
  return tdtDialog({
    title,
    content: html,
    width: 400,
    buttons: [
      { action: "yes", label: yes, icon: "fas fa-check", default: true, callback: () => true },
      { action: "no", label: no, icon: "fas fa-xmark", callback: () => false }
    ]
  }).then(value => value === true);
}

export function choiceDialog(title, prompt, choices) {
  return tdtDialog({
    title,
    content: `<div class="form-group"><label>${esc(prompt)}</label><select name="choice">${choices.map(choice => `<option value="${esc(choice.id)}">${esc(choice.label)}</option>`).join("")}</select></div>`,
    buttons: [
      { action: "ok", label: "Aceptar", icon: "fas fa-check", default: true, callback: form => form.elements.choice.value },
      { action: "cancel", label: "Cancelar" }
    ]
  });
}

export function numberDialog(title, prompt, initial = 0) {
  return tdtDialog({
    title,
    content: `<div class="form-group"><label>${esc(prompt)}</label><input type="number" name="value" value="${Number(initial)}" autofocus></div>`,
    buttons: [
      { action: "ok", label: "Aceptar", icon: "fas fa-check", default: true, callback: form => Number(form.elements.value.value) },
      { action: "cancel", label: "Cancelar" }
    ]
  });
}
