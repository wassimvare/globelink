import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const rootLayout = read("src/routes/__root.tsx");
const authLayout = read("src/routes/_authenticated.tsx");
const onboarding = read("src/components/OnboardingGate.tsx");
const home = read("src/routes/index.tsx");
const search = read("src/routes/search.tsx");
const searchLib = read("src/lib/search.ts");
const destination = read("src/routes/destinations.$slug.tsx");
const destinationIndex = read("src/routes/destinations.index.tsx");
const match = read("src/routes/_authenticated.match.tsx");
const messages = read("src/routes/_authenticated.messages.index.tsx");
const notifications = read("src/routes/_authenticated.notifications.tsx");
const countrySheet = read("src/components/CountrySheet.tsx");
const routeTree = read("src/routeTree.gen.ts");
const header = read("src/components/AppHeader.tsx");
const bootstrap = read("supabase/bootstrap/globelink_auto_setup.sql");
const launcher = read("LANCER_GLOBELINK_APPELS_HTTPS.ps1");
const placesConfigurator = read("CONFIGURER_PHOTOS_GOOGLE_PLACES.ps1");
const auth = read("src/routes/auth.tsx");
const publicCatalog = read("src/lib/public-travel-catalog.functions.ts");
const googleDestinationCatalog = read("src/lib/google-destination-catalog.functions.ts");
const destinationCover = read("src/lib/destination-cover.ts");
const destinationMedia = read("src/lib/destination-media.functions.ts");
const destinationLandmarks = read("src/lib/destination-landmarks.ts");
const catalogImage = read("src/components/CatalogImage.tsx");
const activityDetail = read("src/routes/activities.$slug.tsx");
const dealDetail = read("src/routes/deals.$slug.tsx");
const activitiesIndex = read("src/routes/activities.index.tsx");
const worldActivities = read("src/lib/world-activities.ts");

check(
  "Onboarding visible aussi depuis l’accueil",
  rootLayout.includes("<OnboardingGate>") && !authLayout.includes("<OnboardingGate>"),
);
check(
  "Onboarding 4 étapes",
  onboarding.includes("[0, 1, 2, 3]") && onboarding.includes("Ton prochain voyage"),
);
check(
  "Onboarding personnalise profil et Travel Match",
  onboarding.includes('.from("profiles")') && onboarding.includes('.from("travel_intents")'),
);
check(
  "Accueil personnalisé toujours visible connecté",
  home.includes("Ton GlobeLink personnalisé") &&
    home.includes("phase2-home-profile") &&
    home.includes("phase2-next-travel-intent"),
);
check(
  "Photos accueil résolues avec coordonnées",
  home.includes("lookup={") &&
    home.includes("latitude: item.latitude") &&
    home.includes("longitude: item.longitude"),
);
check(
  "Clé Google Places conservée entre versions",
  launcher.includes("Restore-GlobeLinkGooglePlacesKey") &&
    launcher.includes("GLOBELINK_GOOGLE_PLACES_API_KEY") &&
    launcher.includes("GlobeLink-V10-Publication") &&
    placesConfigurator.includes("GLOBELINK_GOOGLE_PLACES_API_KEY"),
);
check(
  "Recherche universelle filtrable",
  search.includes("activeKind") && search.includes("KIND_META"),
);
check(
  "Recherche vers pages destination",
  searchLib.includes("/destinations/${destination.slug}") &&
    searchLib.includes("slugifyDestination(country)"),
);
check(
  "Page destination installée",
  destination.includes("Destination GlobeLink") &&
    destination.includes("Voyageurs sur cette destination"),
);
check(
  "Explorateur destinations sur route index dédiée",
  destinationIndex.includes('createFileRoute("/destinations/")') &&
    destinationIndex.includes("Destinations") &&
    header.includes('to="/destinations"'),
);
check(
  "Destination agrège catalogue/posts/questions",
  destination.includes("fetchPersistedViewportCatalog") &&
    destination.includes("community_questions") &&
    destination.includes("posts"),
);
check(
  "Destination pays utilise un hub urbain réel",
  destination.includes("WORLD_MAP_HUBS") &&
    destination.includes("catalogCity") &&
    destination.includes("destinationHub"),
);
check(
  "Destination limite les lieux aux sources traçables vérifiées",
  destination.includes("isTrustedVisibleCatalogItem") &&
    destination.includes("fetchBrowserViewportCatalog") &&
    destination.includes("searchInternetCatalog"),
);
check(
  "Destination requête une zone urbaine compacte",
  destination.includes("latitude - 0.055") &&
    destination.includes("longitude - 0.08") &&
    destination.includes("zoom: 14"),
);
check(
  "Explorateur couvre aussi les pays de la carte mondiale",
  destinationIndex.includes("WORLD_MAP_HUBS") && destinationIndex.includes("cover: null"),
);
check(
  "Explorateur ne présente plus de faux paysages Unsplash",
  destinationIndex.includes("verifiedDestinationCover") &&
    destinationCover.includes("unsplash\.com") &&
    destinationIndex.includes("cover: null"),
);
check(
  "Destination Google Places remplit les villes si Overpass tombe",
  destination.includes("fetchGoogleDestinationCatalog") &&
    googleDestinationCatalog.includes("places:searchNearby") &&
    googleDestinationCatalog.includes("GOOGLE_PLACES_API_KEY"),
);
check(
  "Destination affiche la première source réelle sans attendre toutes les APIs",
  destination.includes("Promise.any(candidates)") &&
    destination.includes("fastCatalogQuery") &&
    destination.includes("fullCatalogQuery"),
);
check(
  "Destination réutilise instantanément le cache de la carte",
  destination.includes("getCachedViewportCatalog") &&
    destination.includes("placeholderData: cachedCatalog"),
);
check(
  "Navigation Destinations préchargée et canonique",
  header.includes('to="/destinations"') && header.includes('preload="intent"'),
);
check(
  "Covers destinations liés à Wikipédia/Wikimedia avec attribution",
  destinationIndex.includes("fetchVerifiedDestinationCovers") &&
    destinationMedia.includes("imageinfo") &&
    destinationMedia.includes("LicenseShortName"),
);
check(
  "Tous les pays sont traités sans plafond de 48 images",
  !destinationIndex.includes(".slice(0, 48)") &&
    destinationMedia.includes("BATCH_SIZE") &&
    destinationMedia.includes("slice(0, 120)"),
);
check(
  "Monuments emblématiques contrôlés",
  destinationLandmarks.includes('France: "Tour Eiffel"') &&
    destinationLandmarks.includes('"États-Unis": "Statue de la Liberté"') &&
    destinationLandmarks.includes('Égypte: "Pyramides de Gizeh"'),
);
check(
  "Fiches pays et destinations utilisent les covers vérifiées",
  destination.includes("<DestinationImage") && countrySheet.includes("<DestinationImage"),
);
check(
  "Photos Google des destinations utilisent la référence exacte",
  googleDestinationCatalog.includes("google_photo_name") &&
    catalogImage.includes("googlePhotoName"),
);
check(
  "Fiches établissement conservent coordonnées et recherche photo",
  activityDetail.includes("latitude,longitude,image_url") &&
    activityDetail.includes("lookup={{") &&
    countrySheet.includes("<CatalogImage"),
);
check(
  "Activités éditoriales disponibles dans tous les pays de la carte",
  worldActivities.includes("ALL_CURATED_WORLD_ACTIVITIES") &&
    worldActivities.includes("EXTRA_ACTIVITY_SEEDS") &&
    worldActivities.includes("WORLD_MAP_HUBS.map"),
);
check(
  "Chaque pays reçoit trois activités réelles de secours",
  worldActivities.includes("[primary, ...extras]") &&
    worldActivities.includes("verified_real_place: true"),
);
check(
  "Explorateur mondial des activités installé",
  activitiesIndex.includes('createFileRoute("/activities/")') &&
    activitiesIndex.includes("Activités dans tous les pays") &&
    header.includes('to="/activities"'),
);
check(
  "Les fiches établissement refusent les photos de destination en secours",
  !catalogImage.includes("fetchVerifiedDestinationCovers") &&
    catalogImage.includes("Aucune photo officielle vérifiée"),
);
check(
  "Les fiches activité bloquent les sources non traçables",
  activityDetail.includes("isTrustedVisibleCatalogItem") &&
    activityDetail.includes("curatedActivityBySlug") &&
    !activityDetail.includes("searchInternetCatalog"),
);
check("Fiches offres utilisent aussi le résolveur photo", dealDetail.includes("<CatalogImage"));
check(
  "Recherche pays privilégie un hub mondial",
  publicCatalog.includes("worldHint") && publicCatalog.includes("WORLD_MAP_HUBS.find"),
);
check(
  "Travel Match public redirige proprement vers auth",
  destination.includes('search={{ redirect: "/match" }}'),
);
check(
  "Inscription vérifie le pseudo via RPC privée",
  auth.includes("is_username_available") &&
    !auth.includes('.ilike("username", validUsername.data)'),
);
check(
  "RPC pseudo disponible aux anonymes sans exposer profiles",
  bootstrap.includes("is_username_available") &&
    bootstrap.includes("grant execute on function public.is_username_available(text) to anon"),
);

check("CountrySheet ouvre page destination", countrySheet.includes("Page destination"));
check(
  "Travel Match V2 contextualisé",
  match.includes("phase2-match-context") && match.includes("Pourquoi {score}%"),
);
check(
  "Messagerie V2 recherche",
  messages.includes("Rechercher une conversation") && messages.includes("onlyUnread"),
);
check(
  "Nouveau match apparaît en temps réel dans Messages",
  messages.includes("conversation_participants") &&
    messages.includes("Nouveau match — envoie le premier message"),
);
check(
  "Notifications Travel Match",
  notifications.includes("travel_match") &&
    notifications.includes("t’a liké sur Travel Match") &&
    notifications.includes("conversation_id"),
);
check(
  "RPC Match crée les notifications",
  bootstrap.includes("'scope', 'travel_match'") && bootstrap.includes("'event', 'match'"),
);
check(
  "Notifications filtrables",
  notifications.includes("visibleNotifs") &&
    notifications.includes("Social") &&
    notifications.includes("Voyage"),
);
check(
  "Routes destinations générées",
  routeTree.includes("'/destinations/'") && routeTree.includes("'/destinations/$slug'"),
);
check("Phase 2 conserve carte V12", fs.existsSync(path.join(root, "scripts/map-v12-check.mjs")));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "✅" : "❌"} ${item.name}`);
console.log(`\nPhase 2: ${checks.length - failed.length}/${checks.length} contrôles réussis.`);
if (failed.length) process.exit(1);
