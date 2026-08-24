import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const payloadDir = path.resolve(".v11-api-payload");
if (!fs.existsSync(payloadDir)) {
  console.log("[GlobeLink] No V11 API payload to apply.");
  process.exit(0);
}

const chunks = fs
  .readdirSync(payloadDir)
  .filter((name) => /^chunk-\d+$/.test(name))
  .sort();

if (!chunks.length) {
  console.log("[GlobeLink] V11 API payload is empty.");
  process.exit(0);
}

const encoded = chunks
  .map((name) => fs.readFileSync(path.join(payloadDir, name), "utf8").trim())
  .join("");
const archive = path.join(os.tmpdir(), `globelink-v11-api-${process.pid}.tar.gz`);
fs.writeFileSync(archive, Buffer.from(encoded, "base64"));

const result = spawnSync("tar", ["-xzf", archive, "-C", process.cwd()], {
  stdio: "inherit",
});
fs.rmSync(archive, { force: true });

if (result.status !== 0) {
  console.error("[GlobeLink] Impossible d'appliquer le patch Google Places/Ticketmaster.");
  process.exit(result.status || 1);
}

console.log("[GlobeLink] Google Places + Ticketmaster V11 sources applied.");