import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routesDir = path.join(root, "src/routes");
const routeFiles = fs.readdirSync(routesDir).filter((name) => name.endsWith(".tsx"));

const protectedSurfaces = [
  { url: "/trips", files: ["_authenticated.trips.index.tsx"] },
  { url: "/match", files: ["_authenticated.match.tsx"] },
  { url: "/messages", files: ["_authenticated.messages.index.tsx"] },
  { url: "/notifications", files: ["_authenticated.notifications.tsx"] },
  { url: "/settings", files: ["_authenticated.settings.tsx"] },
  { url: "/activity", files: ["_authenticated.activity.tsx"] },
  { url: "/dashboard", files: ["_authenticated.dashboard.tsx"] },
  { url: "/achievements", files: ["_authenticated.achievements.tsx"] },
  { url: "/intelligence", files: ["_authenticated.intelligence.tsx"] },
];

const publicSurfaces = [
  "index.tsx",
  "auth.tsx",
  "map.tsx",
  "search.tsx",
  "destinations.index.tsx",
  "destinations.$slug.tsx",
  "activities.index.tsx",
  "activities.$slug.tsx",
];

const failures = [];
const ok = (label) => console.log(`✅ ${label}`);
const fail = (label) => {
  failures.push(label);
  console.error(`❌ ${label}`);
};

const authLayoutPath = path.join(routesDir, "_authenticated.tsx");
if (!fs.existsSync(authLayoutPath)) {
  fail("Layout d'authentification présent");
} else {
  const authLayout = fs.readFileSync(authLayoutPath, "utf8");
  const guardsSession = authLayout.includes("supabase.auth.getSession()") && authLayout.includes('to: "/auth"');
  const guardsVerification = authLayout.includes("email_confirmed_at") && authLayout.includes('to: "/verify-email"');
  const guardsDisabled = authLayout.includes('profile?.status === "deactivated"') && authLayout.includes('to: "/account-deactivated"');
  guardsSession ? ok("Session requise sur le layout privé") : fail("Session requise sur le layout privé");
  guardsVerification ? ok("Compte confirmé requis sur le layout privé") : fail("Compte confirmé requis sur le layout privé");
  guardsDisabled ? ok("Compte désactivé bloqué sur le layout privé") : fail("Compte désactivé bloqué sur le layout privé");
}

for (const surface of protectedSurfaces) {
  const present = surface.files.some((file) => routeFiles.includes(file));
  present ? ok(`${surface.url} reste derrière _authenticated`) : fail(`${surface.url} reste derrière _authenticated`);

  const publicDuplicate = routeFiles.some((file) =>
    surface.files.some((protectedFile) => file === protectedFile.replace(/^_authenticated\./, "")),
  );
  !publicDuplicate
    ? ok(`${surface.url} n'a pas de doublon public`)
    : fail(`${surface.url} n'a pas de doublon public`);
}

for (const file of publicSurfaces) {
  fs.existsSync(path.join(routesDir, file))
    ? ok(`Surface publique conservée: ${file}`)
    : fail(`Surface publique conservée: ${file}`);
}

const generatedTree = fs.readFileSync(path.join(root, "src/routeTree.gen.ts"), "utf8");
for (const route of ["/trips/", "/match", "/messages/", "/notifications", "/settings", "/map", "/destinations/", "/activities/"]) {
  generatedTree.includes(route)
    ? ok(`Route générée présente: ${route}`)
    : fail(`Route générée présente: ${route}`);
}

console.log(`\nPhase 2 surfaces critiques: ${failures.length ? "ÉCHEC" : "OK"}`);
if (failures.length) process.exit(1);
