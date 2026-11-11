/** Money is stored as one non-negative decimal amount with cent precision. */
export function normalizeMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round((numeric + Number.EPSILON) * 100) / 100);
}

export function mergeLegacyMoney(major, minor) {
  return normalizeMoney(Number(major || 0) + Number(minor || 0) / 100);
}

/** Converts the old major + subunit fields once per world. */
export async function migrateLegacyCurrency() {
  if (!game.user.isGM || game.settings.get("tdt", "decimalCurrencyMigrated")) return;
  for (const actor of game.actors) {
    const source = actor._source?.system ?? {};
    if (!("moneyMinor" in source)) continue;
    await actor.update({
      "system.money": mergeLegacyMoney(source.money, source.moneyMinor),
      "system.-=moneyMinor": null
    });
  }
  await game.settings.set("tdt", "decimalCurrencyMigrated", true);
}
