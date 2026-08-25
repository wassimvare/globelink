import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function applyCallRealtimeHotfix() {
  const callProviderPath = path.resolve("src/components/CallProvider.tsx");
  if (!fs.existsSync(callProviderPath)) return;

  const noisyStatusHandler = `      .subscribe((status) => {
        if (status === "CHANNEL_ERROR")
          toast.error("Le service d’appel en temps réel est indisponible");
      });`;

  const resilientStatusHandler = `      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          console.warn(
            "Le canal Realtime SQL des appels se reconnecte; le canal privé et la récupération SQL restent actifs.",
          );
      });`;

  const source = fs.readFileSync(callProviderPath, "utf8");
  if (source.includes(resilientStatusHandler)) return;

  if (!source.includes(noisyStatusHandler)) {
    console.warn("[GlobeLink] CallProvider realtime status handler already changed; hotfix skipped.");
    return;
  }

  fs.writeFileSync(callProviderPath, source.replace(noisyStatusHandler, resilientStatusHandler));
  console.log("[GlobeLink] Realtime call reconnect hotfix applied.");
}

// Safari/iOS can briefly report CHANNEL_ERROR when Supabase Realtime wakes up or
// reconnects after the app returns from the background. Supabase automatically
// reconnects, so this must not be shown as a fatal error on GlobeLink's home page.
// Apply the source hotfix before both `vite dev` and production builds.
applyCallRealtimeHotfix();

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