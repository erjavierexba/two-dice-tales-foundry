const TokenDocumentBase = foundry.documents?.TokenDocument ?? TokenDocument;

/** The health bar shows the effective maximum (base + feats such as Mr Burns or Primo de Zumosol). */
export class TDTTokenDocument extends TokenDocumentBase {
  getBarAttribute(barName, options) {
    const data = super.getBarAttribute(barName, options);
    if (data?.type !== "bar" || data.attribute !== "health") return data;
    const actor = this.actor;
    if (!actor || actor.type === "mecha") return data;
    const max = Number(actor.system.health?.effectiveMax);
    if (Number.isFinite(max) && max > 0) data.max = max;
    return data;
  }
}
