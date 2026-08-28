import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const transform = path.resolve("scripts/travel-match-v3.mjs");
const result = spawnSync(process.execPath, [transform], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if ((result.status ?? 1) !== 0) process.exit(result.status || 1);

const messagesFile = path.resolve("src/routes/_authenticated.messages.$id.tsx");
let source = fs.readFileSync(messagesFile, "utf8");
const before = source;
source = source.replace(
  "    setText((current) => current.trim() ? current : pending);",
  "    setText((current: string) => current.trim() ? current : pending);",
);

if (source !== before) {
  fs.writeFileSync(messagesFile, source, "utf8");
  console.log("[Travel Match V3] Brouillon de message typé correctement.");
} else if (!source.includes("setText((current: string) => current.trim() ? current : pending);")) {
  console.error("[Travel Match V3] Le correctif de type attendu est introuvable.");
  process.exit(1);
} else {
  console.log("[Travel Match V3] Correctif de type déjà appliqué.");
}
