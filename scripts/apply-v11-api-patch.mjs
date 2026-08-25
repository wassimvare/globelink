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

function applyActivitySettingsEntry() {
  const settingsHubPath = path.resolve("src/components/SettingsHub.tsx");
  if (!fs.existsSync(settingsHubPath)) return;

  const source = fs.readFileSync(settingsHubPath, "utf8");
  if (source.includes('aria-label="Ouvrir Votre activité"')) return;

  const marker = `        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">`;
  if (!source.includes(marker)) {
    console.warn("[GlobeLink] SettingsHub activity insertion point not found; entry skipped.");
    return;
  }

  const activityEntry = `        <Link
          to="/activity"
          aria-label="Ouvrir Votre activité"
          className="group mt-5 flex min-h-20 items-center gap-4 rounded-2xl border border-primary/25 bg-primary/[0.07] p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-soft"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-semibold text-foreground">
              Votre activité
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Likes, commentaires, contenus enregistrés, publications, stories, Travel Match et historique de recherche.
            </p>
          </div>
        </Link>`;

  fs.writeFileSync(settingsHubPath, source.replace(marker, `${activityEntry}\n\n${marker}`));
  console.log("[GlobeLink] Your Activity settings entry applied.");
}

// Safari/iOS can briefly report CHANNEL_ERROR when Supabase Realtime wakes up or
// reconnects after the app returns from the background. Supabase automatically
// reconnects, so this must not be shown as a fatal error on GlobeLink's home page.
// Apply the source hotfix before both `vite dev` and production builds.
applyCallRealtimeHotfix();

// Keep the activity center discoverable from Settings without mounting a client-only
// shortcut in the authenticated route layout. That layout-level shortcut caused a
// TanStack Start server bundle regression on Vercel, while this settings-only entry
// keeps the feature visible and isolated from the server middleware graph.
applyActivitySettingsEntry();

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