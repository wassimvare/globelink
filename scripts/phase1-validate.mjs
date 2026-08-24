import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const failures = [];
const passes = [];
function check(name, ok, detail = "") {
  if (ok) passes.push(name);
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const pkg = JSON.parse(read("package.json"));
const authRoute = read("src/routes/_authenticated.tsx");
const adminFns = read("src/lib/admin.functions.ts");
const matchFns = read("src/lib/match.functions.ts");
const callProvider = read("src/components/CallProvider.tsx");
const rtcConfig = read("src/lib/rtc-config.functions.ts");
const messages = read("src/routes/_authenticated.messages.$id.tsx");
const client = read("src/integrations/supabase/client.ts");
const middleware = read("src/integrations/supabase/auth-middleware.ts");

check("route authentifiée vérifie l'utilisateur", /supabase\.auth\.getUser\(\)/.test(authRoute));
check(
  "route authentifiée refuse les comptes non confirmés",
  /email_confirmed_at/.test(authRoute) && /verify-email/.test(authRoute),
);
check("client Supabase vérifie la clé publique", /assertSafeSupabasePublishableKey/.test(client));
check(
  "middleware serveur vérifie la clé publique",
  /assertSafeSupabasePublishableKey/.test(middleware),
);
check(
  "middleware serveur valide le bearer JWT",
  /getClaims\(token\)/.test(middleware) && /extractBearerToken/.test(middleware),
);
check("Match valide un UUID cible", /isUuid\(data\?\.toUserId\)/.test(matchFns));
check(
  "admin exige assertAdmin",
  /async function assertAdmin/.test(adminFns) &&
    (adminFns.match(/await assertAdmin\(context\)/g)?.length ?? 0) >= 10,
);
check(
  "TURN n'utilise plus VITE_TURN_CREDENTIAL",
  !/VITE_TURN_(URL|USERNAME|CREDENTIAL)/.test(callProvider),
);
check(
  "TURN est récupéré côté serveur",
  /process\.env\.TURN_URL/.test(rtcConfig) && /requireSupabaseAuth/.test(rtcConfig),
);
check("messagerie gère les erreurs de lecture", /if \(error\) throw error;/.test(messages));
check(
  "messagerie nettoie le timer typing",
  /typingTimeoutRef/.test(messages) && /clearTimeout\(typingTimeoutRef\.current\)/.test(messages),
);
check("check global inclut sécurité", /check:security/.test(pkg.scripts?.check ?? ""));

const migrationsDir = path.join(root, "supabase", "migrations");
const migrationText = fs
  .readdirSync(migrationsDir)
  .filter((n) => n.endsWith(".sql"))
  .map((n) => fs.readFileSync(path.join(migrationsDir, n), "utf8"))
  .join("\n")
  .toLowerCase();
const rlsTables = [
  "profiles",
  "posts",
  "stories",
  "travel_intents",
  "match_likes",
  "match_passes",
  "conversations",
  "conversation_participants",
  "messages",
  "places",
  "reports",
  "user_roles",
  "purchases",
  "notifications",
];
for (const table of rlsTables) {
  const re = new RegExp(
    `alter\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`,
    "i",
  );
  check(`RLS activé: ${table}`, re.test(migrationText));
}

// Browser-bundled VITE variables must not look like privileged secrets.
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(path.join(root, "src"));
const source = sourceFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
check(
  "aucune variable VITE privilégiée évidente",
  !/import\.meta\.env\.VITE_[A-Z0-9_]*(SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY|TURN_CREDENTIAL)/.test(
    source,
  ),
);

for (const name of passes) console.log(`✓ ${name}`);
if (failures.length) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  console.error(`\nPhase 1 refusée: ${failures.length} contrôle(s) en échec.`);
  process.exit(1);
}
console.log(`\n✓ Validation statique Phase 1 réussie (${passes.length} contrôles).`);
