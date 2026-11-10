import { TDT } from "./config.mjs";
import { moduleActive, rule } from "./settings.mjs";

/** The module a TDT compendium belongs to ("" for the basic module). */
export function packModule(pack) {
  return pack.metadata?.flags?.tdt?.module ?? "";
}

/** Whether a TDT compendium should be visible with the current settings. */
export function packEnabled(pack) {
  if (pack.metadata?.packageName !== "tdt" && pack.metadata?.system !== "tdt") return true;
  if (pack.metadata?.packageType !== "system") return true;
  const module = packModule(pack);
  if (module && !moduleActive(module)) return false;
  if (pack.metadata.name === "basic-weapons" && !rule("specificWeapons")) return false;
  return true;
}

/**
 * Copies the compendium content of the basic module and of every active module into the world,
 * in one folder per module. Existing documents with the same name are skipped.
 */
export async function importContent({ modules = null } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn("Solo el DJ puede importar el contenido de TDT.");
    return null;
  }
  const wanted = modules ?? ["", ...Object.keys(TDT.modules).filter(moduleActive)];
  const packs = game.packs.filter(pack => pack.metadata.packageName === "tdt" && wanted.includes(packModule(pack)) && packEnabled(pack));
  let total = 0;
  for (const pack of packs) {
    const module = packModule(pack);
    const folderName = module ? `TDT · ${TDT.modules[module].replace(/^Módulo (de )?/, "")}` : "TDT · Módulo básico";
    const folder = await getOrCreateFolder(folderName, pack.documentName);
    const collection = game.collections.get(pack.documentName);
    const existing = new Set(collection.filter(document => document.folder?.id === folder.id).map(document => document.name));
    const documents = await pack.getDocuments();
    const data = documents
      .filter(document => !existing.has(document.name))
      .map(document => {
        const source = collection.fromCompendium(document);
        source.folder = folder.id;
        return source;
      });
    if (data.length) await collection.documentClass.createDocuments(data);
    total += data.length;
  }
  ui.notifications.info(`TDT: importados ${total} documentos de ${packs.length} compendios.`);
  return total;
}

/** Kept for macros written for the basic version of the system. */
export const importBasicContent = () => importContent({ modules: [""] });

async function getOrCreateFolder(name, type) {
  const existing = game.folders.find(folder => folder.type === type && folder.name === name);
  return existing ?? Folder.create({ name, type, color: type === "Actor" ? "#b63b32" : type === "RollTable" ? "#6b4a2a" : "#245c6b" });
}
