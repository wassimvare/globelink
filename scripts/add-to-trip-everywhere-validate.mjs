import fs from "node:fs";

const root = new URL("../", import.meta.url);

function read(path) {
  return fs.readFileSync(new URL(path, root), "utf8");
}

function assertIncludes(path, expected, label) {
  const source = read(path);
  if (!source.includes(expected)) {
    throw new Error(`[add-to-trip] ${label} manque dans ${path}`);
  }
}

const surfaces = [
  "src/routes/destinations.$slug.tsx",
  "src/routes/destinations.index.tsx",
  "src/routes/activities.$slug.tsx",
  "src/routes/activities.index.tsx",
  "src/routes/deals.$slug.tsx",
  "src/routes/deals.index.tsx",
  "src/routes/map.tsx",
  "src/routes/index.tsx",
  "src/routes/search.tsx",
  "src/components/CountrySheet.tsx",
  "src/components/PostCard.tsx",
  "src/routes/post.$id.tsx",
];

for (const path of surfaces) {
  assertIncludes(path, "AddToTripButton", "le bouton Ajouter au voyage");
}

const explorer = read("src/routes/map.tsx");
for (const legacy of ["explorer-trip-picker", "explorer-trips", "const addToTrip = async"]) {
  if (explorer.includes(legacy)) {
    throw new Error(
      `[add-to-trip] Explorer conserve encore le flux legacy « ${legacy} » au lieu du composant partagé.`,
    );
  }
}

const shared = read("src/components/AddToTripButton.tsx");
for (const expected of [
  '.is("finalized_at", null)',
  "buildTripDateRange",
  'visited_on: selectedDay || null',
  'À organiser plus tard',
  'data-testid="add-to-trip-day"',
  'data-testid="confirm-add-to-trip"',
]) {
  if (!shared.includes(expected)) {
    throw new Error(`[add-to-trip] Contrat partagé incomplet : ${expected}`);
  }
}

const postCard = read("src/components/PostCard.tsx");
for (const expected of ["lat: post.lat", "lng: post.lng"]) {
  if (!postCard.includes(expected)) {
    throw new Error(`[add-to-trip] Une publication ne conserve pas ses coordonnées : ${expected}`);
  }
}

console.log(
  `[GlobeLink] Ajouter à mon voyage validé sur ${surfaces.length} surfaces + contrat partagé Explorer/journées.`,
);
