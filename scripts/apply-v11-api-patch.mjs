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

function applyAccountDataSettingsEntry() {
  const settingsHubPath = path.resolve("src/components/SettingsHub.tsx");
  if (!fs.existsSync(settingsHubPath)) return;

  const source = fs.readFileSync(settingsHubPath, "utf8");
  if (source.includes('aria-label="Ouvrir Compte, données et sécurité"')) return;

  const marker = `        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">`;
  if (!source.includes(marker)) {
    console.warn("[GlobeLink] SettingsHub account data insertion point not found; entry skipped.");
    return;
  }

  const accountEntry = `        <Link
          to="/settings/account"
          aria-label="Ouvrir Compte, données et sécurité"
          className="group mt-3 flex min-h-20 items-center gap-4 rounded-2xl border border-border/70 bg-background/65 p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-semibold text-foreground">
              Compte, données et sécurité
              <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Appareils connectés, export, permissions, cache, désactivation et suppression du compte.
            </p>
          </div>
        </Link>`;

  fs.writeFileSync(settingsHubPath, source.replace(marker, `${accountEntry}\n\n${marker}`));
  console.log("[GlobeLink] Account data settings entry applied.");
}

function applyInstagramStyleSettingsNavigation() {
  const appHeaderPath = path.resolve("src/components/AppHeader.tsx");
  if (fs.existsSync(appHeaderPath)) {
    const source = fs.readFileSync(appHeaderPath, "utf8");
    const next = source.replace(
      '<Link to="/settings/profile" className="rounded-xl">\n                      <Settings className="mr-2 h-4 w-4" /> Paramètres et confidentialité',
      '<Link to="/settings" className="rounded-xl">\n                      <Settings className="mr-2 h-4 w-4" /> Paramètres et confidentialité',
    );
    if (next !== source) {
      fs.writeFileSync(appHeaderPath, next);
      console.log("[GlobeLink] Profile menu now opens the settings hub.");
    }
  }

  const profileSettingsPath = path.resolve("src/routes/_authenticated.settings.profile.tsx");
  if (fs.existsSync(profileSettingsPath)) {
    const source = fs.readFileSync(profileSettingsPath, "utf8");
    const next = source
      .replace('import { SettingsHub } from "@/components/SettingsHub";\n', "")
      .replace('import { SocialPrivacySettings } from "@/components/SocialPrivacySettings";\n', "")
      .replace('      { title: "Paramètres et confidentialité — GlobeLink" },', '      { title: "Votre compte — GlobeLink" },')
      .replace('        content: "Gère ton compte, ta confidentialité, tes notifications et ton profil GlobeLink.",', '        content: "Modifie ton profil et tes informations personnelles GlobeLink.",')
      .replace('        <SettingsHub />\n        <SocialPrivacySettings />\n\n', "");
    if (next !== source) {
      fs.writeFileSync(profileSettingsPath, next);
      console.log("[GlobeLink] Profile settings page isolated from the settings hub.");
    }
  }
}

applyCallRealtimeHotfix();
applyActivitySettingsEntry();
applyAccountDataSettingsEntry();
applyInstagramStyleSettingsNavigation();

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