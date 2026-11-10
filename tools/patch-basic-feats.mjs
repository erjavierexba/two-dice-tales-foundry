/**
 * Applies tools/basic-feat-rules.mjs to the generated data without regenerating it
 * (data/modules-content.json carries hand tweaks that a rebuild would lose).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyBasicFeatOverride } from "./basic-feat-rules.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
let changed = 0;
const walk = node => {
  if (Array.isArray(node)) return node.forEach(walk);
  if (!node || typeof node !== "object") return;
  if (node.type === "feat" && node.system && !node.system.module && applyBasicFeatOverride(node)) changed++;
  for (const value of Object.values(node)) walk(value);
};
for (const file of ["../data/basic-content.json", "../data/modules-content.json"]) {
  const full = path.join(here, file);
  const text = fs.readFileSync(full, "utf8");
  const indent = text.match(/^\{\n( +)/)?.[1].length ?? 2;
  const data = JSON.parse(text);
  walk(data);
  fs.writeFileSync(full, `${JSON.stringify(data, null, indent)}\n`);
}
console.log(`Dotes del básico actualizadas: ${changed}`);
