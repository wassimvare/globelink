import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}
function write(path, content) {
  fs.writeFileSync(path, content);
}
function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`[Phase 4] Bloc introuvable: ${label}`);
  return source.replace(before, after);
}

// Explorer: move map domain/data shaping out of the route.
{
  const path = "src/routes/map.tsx";
  let source = read(path);
  source = source.replace('import { PLACE_CATEGORIES } from "@/lib/countries";\n', "");
  source = source.replace("  fetchLiveCatalog,\n", "");
  source = source.replace("  type LiveCatalogKind,\n", "");
  source = source.replace("  type AccountSettings,\n", "");

  const anchor = `import {\n  DEFAULT_ACCOUNT_SETTINGS,\n  getAccountSettings,\n} from "@/lib/account-settings";\n`;
  const domainImport = `${anchor}import {\n  ALL_PLACE_CATEGORIES,\n  BUDGET_LABELS,\n  MAP_PLACE_CATEGORIES,\n  SECONDARY_PLACE_CATEGORIES,\n  categoriesFromSettings,\n  catalogBaseCategory,\n  catalogKey,\n  catalogMarkerCategory,\n  distanceBetweenKm,\n  fetchMapCatalog,\n  isMapOfferFallback,\n  isOfferPlace,\n  mapCategoryMeta,\n  type AnyPlace,\n  type MapViewport,\n  type SortKey,\n} from "@/features/explorer/map-domain";\n`;
  source = replaceRequired(source, anchor, domainImport, "import map-domain");

  const start = source.indexOf("type AnyPlace = {");
  const end = source.indexOf("function escapeHtml(value: string)");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("[Phase 4] Impossible d'isoler le domaine de map.tsx");
  }
  source = source.slice(0, start) + source.slice(end);
  write(path, source);
}

// Travel: keep route focused on orchestration/rendering.
{
  const path = "src/routes/_authenticated.trips.index.tsx";
  let source = read(path);
  source = source.replace('import { useMemo, useState } from "react";', 'import { useState } from "react";');
  source = source.replace(
    'import { destinationCover, resolvedDestinationCover } from "@/lib/destination-cover";',
    'import { resolvedDestinationCover } from "@/lib/destination-cover";\nimport {\n  EMPTY_TRIP_FORM,\n  buildTripInsert,\n  formatTripDate,\n  isTripActive,\n  selectFocusTrip,\n  tripStatusLabel,\n} from "@/features/travel/trip-domain";',
  );

  source = replaceRequired(
    source,
    `  const [form, setForm] = useState({\n    title: "",\n    country: "",\n    city: "",\n    budget: "",\n    startsOn: "",\n    endsOn: "",\n    notes: "",\n  });`,
    `  const [form, setForm] = useState({ ...EMPTY_TRIP_FORM });`,
    "état formulaire voyage",
  );

  const focusStart = source.indexOf("  const today = new Date().toISOString().slice(0, 10);");
  const focusEndMarker = "  const create = useMutation({";
  const focusEnd = source.indexOf(focusEndMarker, focusStart);
  if (focusStart < 0 || focusEnd < 0) throw new Error("[Phase 4] Bloc focus voyage introuvable");
  source =
    source.slice(0, focusStart) +
    `  const today = new Date().toISOString().slice(0, 10);\n  const focusTrip = selectFocusTrip(trips, today);\n  const focusIsActive = isTripActive(focusTrip, today);\n\n` +
    source.slice(focusEnd);

  const mutationStart = source.indexOf("    mutationFn: async () => {");
  const mutationEnd = source.indexOf("    onSuccess: (data) => {", mutationStart);
  if (mutationStart < 0 || mutationEnd < 0) throw new Error("[Phase 4] Mutation création voyage introuvable");
  source =
    source.slice(0, mutationStart) +
    `    mutationFn: async () => {\n      const { data, error } = await supabase\n        .from("trips")\n        .insert(buildTripInsert(user!.id, form))\n        .select("id")\n        .single();\n      if (error) throw error;\n      return data;\n    },\n` +
    source.slice(mutationEnd);

  source = replaceRequired(
    source,
    `      setForm({\n        title: "",\n        country: "",\n        city: "",\n        budget: "",\n        startsOn: "",\n        endsOn: "",\n        notes: "",\n      });`,
    `      setForm({ ...EMPTY_TRIP_FORM });`,
    "reset formulaire voyage",
  );

  source = source.replaceAll("formatDate(", "formatTripDate(");
  source = source.replaceAll("statusLabel(", "tripStatusLabel(");

  const helpersStart = source.indexOf("\nfunction formatTripDate(value: string)");
  if (helpersStart >= 0) source = source.slice(0, helpersStart).trimEnd() + "\n";
  write(path, source);
}

console.log("[Phase 4] Explorer et Voyage découpés en domaines sans changer les parcours UI.");
