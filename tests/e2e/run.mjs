/**
 * Pruebas e2e en un Foundry real: `npm run test:e2e`.
 * Arranca un servidor aislado (directorio temporal, mundo desechable), entra con Chrome sin ventana
 * y ejecuta los casos de tests/e2e/cases.mjs. Variables útiles:
 *   TDT_E2E_ONLY=texto      solo los casos cuyo nombre contenga el texto
 *   TDT_E2E_VERBOSE=1       muestra el registro del servidor
 *   TDT_E2E_HEADFUL=1       abre Chrome con ventana
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareData, startServer } from "./server.mjs";
import { launchBrowser, login } from "./browser.mjs";
import { cases } from "./cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const helpers = fs.readFileSync(path.join(here, "page-helpers.js"), "utf8");
const only = process.env.TDT_E2E_ONLY;
const CASE_TIMEOUT = Number(process.env.TDT_E2E_TIMEOUT ?? 45000);
// Si algo cuelga el proceso, que no quede ningún Foundry suelto.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server?.child.kill(); process.exit(130); });

prepareData();
var server = startServer();
let browser;
let failures = 0;
try {
  await server.ready;
  browser = await launchBrowser();
  const gmSession = await login(browser, "Gamemaster");
  const gm = gmSession.page;
  // Preparación del mundo: los cinco módulos activos, sin canvas (los objetivos se simulan)
  // y un jugador para las pruebas multijugador. Después se recarga para que todo surta efecto.
  await gm.evaluate(async () => {
    for (const key of game.settings.settings.keys()) if (key.startsWith("tdt.module.")) await game.settings.set("tdt", key.slice(4), true);
    await game.settings.set("core", "noCanvas", true);
    if (!game.users.getName("Jugador")) await User.create({ name: "Jugador", role: CONST.USER_ROLES.PLAYER });
  });
  await gm.reload({ waitUntil: "domcontentloaded" });
  await gm.waitForFunction(() => globalThis.game?.ready === true, { timeout: 90000 });
  await gm.evaluate(helpers);
  const session = { browser, gm, gmErrors: gmSession.errors, helpers, player: null };
  session.loginPlayer = async () => {
    if (session.player) return session.player;
    const playerSession = await login(browser, "Jugador");
    await playerSession.page.evaluate(helpers);
    session.player = playerSession.page;
    session.playerErrors = playerSession.errors;
    return session.player;
  };
  const selected = cases.filter(entry => !only || entry.name.includes(only));
  for (const entry of selected) {
    const errorsBefore = session.gmErrors.length;
    const started = Date.now();
    try {
      let timer;
      await Promise.race([
        entry.run(session),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Tiempo agotado (${CASE_TIMEOUT / 1000} s)`)), CASE_TIMEOUT); })
      ]).finally(() => clearTimeout(timer));
      const newErrors = session.gmErrors.slice(errorsBefore).filter(text => !/deprecat|is deprecated|postNotification/i.test(text));
      if (newErrors.length) throw new Error(`Errores en la consola del DJ:\n${newErrors.join("\n")}`);
      console.log(`  ✓ ${entry.name} (${Date.now() - started} ms)`);
      await gm.evaluate(() => T.notes.splice(0)).catch(() => {});
    } catch (error) {
      failures++;
      console.log(`  ✗ ${entry.name}\n      ${String(error?.message ?? error).split("\n").join("\n      ")}`);
      const notes = await gm.evaluate(() => T.notes.splice(0).filter(note => note.type !== "info")).catch(() => []);
      if (notes.length) console.log(`      Avisos: ${notes.map(note => `[${note.type}] ${note.message}`).join(" | ")}`);
    } finally {
      await gm.evaluate(() => T.cleanup()).catch(() => {});
      if (session.player) await session.player.evaluate(() => T.targets([])).catch(() => {});
    }
  }
  // ApplicationV1 desaparece en Foundry 16: el sistema no puede usarlo en ninguna parte.
  const legacy = [...new Set(gmSession.warnings.filter(text => /V1 Application framework|appv1|template\.json/i.test(text)))];
  if (legacy.length) {
    failures++;
    console.log(`  ✗ Avisos de APIs obsoletas en la consola del DJ:\n      ${legacy.join("\n      ")}`);
  } else console.log("  ✓ Sin avisos de ApplicationV1 ni de template.json");
  console.log(failures ? `\n${failures} de ${selected.length} pruebas e2e han fallado.` : `\nTDT e2e: ${selected.length} pruebas OK.`);
} catch (error) {
  failures++;
  console.error(error?.stack ?? error);
} finally {
  await browser?.close().catch(() => {});
  server.child.kill();
}
process.exit(failures ? 1 : 0);
