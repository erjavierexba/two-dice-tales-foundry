/**
 * Arranca un Foundry aislado para las pruebas e2e:
 * carpeta de datos propia (en el directorio temporal), el sistema enlazado desde este repo y un mundo desechable.
 * Usa la licencia de la instalación local (FOUNDRY_LICENSE o ~/.local/share/FoundryVTT/Config/license.json).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FOUNDRY_APP = process.env.FOUNDRY_APP ?? path.join(os.homedir(), "ExecApps/FoundryVTT/FoundryVTT/resources/app");
const LICENSE = process.env.FOUNDRY_LICENSE ?? path.join(os.homedir(), ".local/share/FoundryVTT/Config/license.json");
export const DATA = process.env.TDT_E2E_DATA ?? path.join(os.tmpdir(), "tdt-e2e-foundry");
export const PORT = Number(process.env.TDT_E2E_PORT ?? 30555);
export const WORLD = "tdt-e2e";

export function prepareData({ fresh = true } = {}) {
  if (!fs.existsSync(LICENSE)) throw new Error(`No encuentro la licencia de Foundry en ${LICENSE} (define FOUNDRY_LICENSE).`);
  fs.mkdirSync(path.join(DATA, "Config"), { recursive: true });
  fs.mkdirSync(path.join(DATA, "Data/systems"), { recursive: true });
  fs.mkdirSync(path.join(DATA, "Data/worlds"), { recursive: true });
  fs.copyFileSync(LICENSE, path.join(DATA, "Config/license.json"));
  fs.writeFileSync(path.join(DATA, "Config/options.json"), JSON.stringify({
    dataPath: DATA, port: PORT, upnp: false, telemetry: false, language: "en.core", compressStatic: true, world: null
  }, null, 2));
  // Copia (no enlace): Foundry compacta los LevelDB al abrirlos y no debe tocar los packs del repo.
  const target = path.join(DATA, "Data/systems/tdt");
  fs.rmSync(target, { recursive: true, force: true });
  const skip = new Set([".git", "node_modules"]);
  fs.cpSync(root, target, {
    recursive: true,
    filter: source => !skip.has(path.basename(source)) && !/[\\/]packs[\\/][^\\/]+[\\/](LOCK|LOG(\.old)?)$/.test(source)
  });
  const worldDir = path.join(DATA, "Data/worlds", WORLD);
  if (fresh) fs.rmSync(worldDir, { recursive: true, force: true });
  if (!fs.existsSync(worldDir)) {
    fs.mkdirSync(worldDir, { recursive: true });
    const system = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
    fs.writeFileSync(path.join(worldDir, "world.json"), JSON.stringify({
      title: "TDT e2e", id: WORLD, system: "tdt", coreVersion: "13.348",
      compatibility: { minimum: "13", verified: "13" }, systemVersion: system.version, description: "Mundo desechable de pruebas e2e."
    }, null, 2));
  }
}

// Foundry 13 espera Node 20 (con Node 24 el cliente no recibe los datos de versión).
// Orden: FOUNDRY_NODE, un Node 20 de nvm, el Node actual.
function findNode20() {
  if (process.env.FOUNDRY_NODE) return process.env.FOUNDRY_NODE;
  if (process.versions.node.startsWith("20.")) return process.execPath;
  const nvm = path.join(os.homedir(), ".nvm/versions/node");
  const candidate = fs.existsSync(nvm) ? fs.readdirSync(nvm).filter(name => name.startsWith("v20.")).sort().at(-1) : null;
  if (candidate) return path.join(nvm, candidate, "bin/node");
  console.warn("Aviso: no encuentro Node 20 (define FOUNDRY_NODE); Foundry 13 puede fallar con otra versión.");
  return process.execPath;
}
const NODE = findNode20();

export function startServer() {
  const child = spawn(NODE, [path.join(FOUNDRY_APP, "main.js"), `--dataPath=${DATA}`, `--port=${PORT}`, `--world=${WORLD}`, "--noupnp", "--noupdate"], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: FOUNDRY_APP // Foundry lee su package.json (datos de versión) del directorio de trabajo.
  });
  const log = [];
  const ready = new Promise((resolve, reject) => {
    const onData = chunk => {
      const text = chunk.toString();
      log.push(text);
      if (process.env.TDT_E2E_VERBOSE) process.stdout.write(`[foundry] ${text}`);
      if (/Server started and listening|listening on port/i.test(text)) resolve();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", code => reject(new Error(`Foundry se cerró (código ${code}):\n${log.join("")}`)));
    setTimeout(() => reject(new Error(`Foundry no arrancó a tiempo:\n${log.join("")}`)), 60000);
  });
  return { child, ready, log };
}
