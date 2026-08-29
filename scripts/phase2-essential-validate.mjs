import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const authLayout = read("src/routes/_authenticated.tsx");
const home = read("src/routes/index.tsx");
const destination = read("src/routes/destinations.$slug.tsx");
const map = read("src/routes/map.tsx");
const match = read("src/routes/_authenticated.match.tsx");
const messages = read("src/routes/_authenticated.messages.index.tsx");
const notifications = read("src/routes/_authenticated.notifications.tsx");
const trips = read("src/routes/_authenticated.trips.$id.tsx");
const tripDay = read("src/components/TripDaySectionPremium.tsx");
const aiPro = read("src/lib/ai-pro.functions.ts");
const settings = read("src/components/SettingsHub.tsx");
const profileActions = read("src/components/ProfileActions.tsx");

check(
  "Routes privées protégées par session",
  authLayout.includes("supabase.auth.getSession()") && authLayout.includes('to: "/auth"'),
);
check(
  "Comptes non confirmés bloqués",
  authLayout.includes("email_confirmed_at") && authLayout.includes('to: "/verify-email"'),
);
check(
  "Comptes désactivés bloqués",
  authLayout.includes('profile?.status === "deactivated"') && authLayout.includes('to: "/account-deactivated"'),
);
check(
  "Accueil conserve feed, stories et personnalisation par session",
  home.includes("StoriesBar") && home.includes("PostCard") && home.includes("useAuth()") && home.includes('type FeedTab = "foryou" | "following" | "nearby"'),
);
check(
  "Destination conserve uniquement des lieux traçables",
  destination.includes("isTrustedVisibleCatalogItem") && destination.includes("fetchBrowserViewportCatalog"),
);
check(
  "Destination réutilise le cache avant réseau",
  destination.includes("getCachedViewportCatalog") && destination.includes("placeholderData"),
);
check(
  "Carte conserve catalogue et affichage monde",
  map.includes("fetchLiveCatalog") && map.includes("CatalogImage") && map.includes("WORLD_MAP_HUBS"),
);
check(
  "Travel Match calcule une compatibilité explicable",
  match.includes("function scoreTraveler") && match.includes("function matchQuality") && match.includes("suggestedMeetups"),
);
check(
  "Travel Match crée les likes via fonction serveur",
  match.includes("sendMatchLike") && match.includes("useServerFn"),
);
check(
  "Messagerie recharge les nouveaux messages en realtime",
  messages.includes('table: "messages"') && messages.includes('queryKey: ["conversations", user.id]'),
);
check(
  "Messagerie recharge les nouveaux participants/matchs en realtime",
  messages.includes('table: "conversation_participants"') && messages.includes("filter: `user_id=eq.${user.id}`"),
);
check(
  "Notifications conservent Travel Match et conversation",
  notifications.includes("travel_match") && notifications.includes("conversation_id"),
);
check(
  "Carnet reçoit uniquement les entrées de la journée avec accès au contexte global",
  trips.includes("allEntries={entries ?? []}") && tripDay.includes("allEntries = entries"),
);
check(
  "Carnet extrait le programme IA par journée",
  tripDay.includes("extractProgramForDay") && tripDay.includes("programSource"),
);
check(
  "IA+ impose une séparation quotidienne",
  aiPro.includes("AI_DAY_SPLIT_V2") && aiPro.includes("YYYY-MM-DD"),
);
check(
  "Paramètres conservent confidentialité et contrôles de comptes",
  settings.includes("Confidentialité") && settings.includes("Comptes bloqués et restreints") && settings.includes("setRelationshipControl"),
);
check(
  "Actions profil restent réservées aux autres utilisateurs",
  profileActions.includes("targetUserId") && profileActions.includes("currentUserId") && profileActions.includes("Bloquer") && profileActions.includes("Signaler"),
);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "✅" : "❌"} ${item.name}`);
console.log(`\nPhase 2 essentielle: ${checks.length - failed.length}/${checks.length} contrôles réussis.`);
if (failed.length) process.exit(1);
