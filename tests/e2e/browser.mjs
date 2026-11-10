import puppeteer from "puppeteer-core";
import { PORT } from "./server.mjs";

export const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
export const URL = `http://localhost:${PORT}`;

export async function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.TDT_E2E_HEADFUL ? false : "new",
    args: ["--no-sandbox", "--window-size=1600,1000", "--disable-gpu", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
    defaultViewport: { width: 1600, height: 1000 }
  });
}

/** Opens a page logged in as the given user and waits until Foundry is ready. */
export async function login(browser, userName, { context = null } = {}) {
  const ctx = context ?? await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error?.stack ?? error)));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource/.test(text)) return; // se registra con la URL en «response»
    errors.push(text);
  });
  page.on("response", response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(`${URL}/join`, { waitUntil: "networkidle0" });
  // La primera visita crea la cookie de sesión; el formulario necesita cargarse ya con ella.
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector('select[name="userid"]', { timeout: 30000 });
  await page.waitForFunction(() => globalThis.game?.view === "join" || document.readyState === "complete", { timeout: 30000 });
  await page.evaluate(name => {
    const select = document.querySelector('select[name="userid"]');
    const option = [...select.options].find(entry => entry.textContent.trim() === name);
    if (!option) throw new Error(`No existe el usuario ${name}: ${[...select.options].map(o => o.textContent.trim()).join(", ")}`);
    select.value = option.value;
  }, userName);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
    page.click('button[name="join"]')
  ]);
  if (process.env.TDT_E2E_VERBOSE) console.log("cookies", JSON.stringify(await page.cookies()));
  try {
    await page.waitForFunction(() => globalThis.game?.ready === true, { timeout: 90000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ url: location.href, hasGame: Boolean(globalThis.game), title: document.title, body: document.body?.innerText?.slice(0, 500) })).catch(() => ({}));
    throw new Error(`Foundry no terminó de cargar para ${userName}: ${JSON.stringify(state)}\nErrores:\n${errors.join("\n")}`);
  }
  return { page, errors, context: ctx };
}
