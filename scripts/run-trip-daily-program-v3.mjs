import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const target = new URL("./trip-daily-program-v3.mjs", import.meta.url);
let source = fs.readFileSync(target, "utf8");

source = source
  .replace(/(?<!\\)\$\{section\.title\}/g, "\\${section.title}")
  .replace(/(?<!\\)\$\{itemIndex\}/g, "\\${itemIndex}");

fs.writeFileSync(target, source);

const result = spawnSync(process.execPath, [fileURLToPath(target)], {
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
