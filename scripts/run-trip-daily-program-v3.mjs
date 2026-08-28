import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const target = new URL("./trip-daily-program-v3.mjs", import.meta.url);
let source = fs.readFileSync(target, "utf8");

source = source
  .replace(/(?<!\\)\$\{section\.title\}/g, "\\${section.title}")
  .replace(/(?<!\\)\$\{itemIndex\}/g, "\\${itemIndex}")
  .replace(
    "Compare réellement les options dans un tableau clair. Donne avantages, limites, budget estimatif, emplacement/logistique et un verdict selon au moins deux profils de voyageurs.",
    "Compare réellement les options sous forme de sous-sections courtes, une option par bloc. Donne avantages, limites, budget estimatif, emplacement/logistique et un verdict selon au moins deux profils de voyageurs. N’utilise jamais de tableau Markdown avec des barres verticales.",
  );

fs.writeFileSync(target, source);

const result = spawnSync(process.execPath, [fileURLToPath(target)], {
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
