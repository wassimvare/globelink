import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), "src/routes/destinations.$slug.tsx");
let source = readFileSync(path, "utf8");
const original = source;

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`[Destination public catalog] Motif introuvable: ${label}`);
  }
  source = source.replace(before, after);
}

// Bust the previous client cache after changing the source strategy.
source = source
  .replace(/destination-fast-catalog-v5/g, "destination-fast-catalog-v6")
  .replace(/destination-full-catalog-v5/g, "destination-full-catalog-v6");

const oldFastBlock = `      const candidates: Promise<LiveCatalogItem[]>[] = [
        requireRows(
          fetchGoogleDestinationCatalog({
            data: { city: catalogCity, country, latitude, longitude },
          }) as Promise<LiveCatalogItem[]>,
          "Google Places",
        ),
        requireRows(fetchPersistedViewportCatalog(bounds), "catalogue GlobeLink"),
      ];
      if (typeof window !== "undefined") {
        candidates.push(
          requireRows(
            fetchBrowserViewportCatalog(bounds, { mode: "fast" }) as Promise<LiveCatalogItem[]>,
            "OpenStreetMap rapide",
          ),
        );
      }
      const winner = await Promise.any(candidates).catch(() => [] as LiveCatalogItem[]);
      const rows = normalizeCatalog(winner);`;

const newFastBlock = `      // The free/public catalog is always queried and merged. A partial response from
      // Google, Booking or the database must never suppress OpenStreetMap/Wikidata
      // hotels, restaurants or activities.
      const requests: Promise<LiveCatalogItem[]>[] = [
        (
          searchInternetCatalog({ data: { query: \`${"${catalogCity}"}, ${"${country}"}\` } }) as Promise<
            LiveCatalogItem[]
          >
        ).catch(() => []),
        fetchPersistedViewportCatalog(bounds).catch(() => []),
        (
          fetchGoogleDestinationCatalog({
            data: { city: catalogCity, country, latitude, longitude },
          }) as Promise<LiveCatalogItem[]>
        ).catch(() => []),
      ];
      if (typeof window !== "undefined") {
        requests.push(
          (
            fetchBrowserViewportCatalog(bounds, { mode: "fast" }) as Promise<LiveCatalogItem[]>
          ).catch(() => []),
        );
      }
      const settled = await Promise.allSettled(requests);
      const rows = normalizeCatalog(
        settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
      );`;

replaceRequired(oldFastBlock, newFastBlock, "fusion des sources rapides");

// Public OpenStreetMap/Wikidata goes first in the background enrichment as well.
const oldFullRequests = `      const requests: Promise<LiveCatalogItem[]>[] = [
        (
          fetchGoogleDestinationCatalog({
            data: { city: catalogCity, country, latitude, longitude },
          }) as Promise<LiveCatalogItem[]>
        ).catch(() => []),
        fetchPersistedViewportCatalog(bounds).catch(() => []),
        (
          searchInternetCatalog({ data: { query: \`${"${catalogCity}"}, ${"${country}"}\` } }) as Promise<
            LiveCatalogItem[]
          >
        ).catch(() => []),
      ];`;

const newFullRequests = `      const requests: Promise<LiveCatalogItem[]>[] = [
        (
          searchInternetCatalog({ data: { query: \`${"${catalogCity}"}, ${"${country}"}\` } }) as Promise<
            LiveCatalogItem[]
          >
        ).catch(() => []),
        fetchPersistedViewportCatalog(bounds).catch(() => []),
        (
          fetchGoogleDestinationCatalog({
            data: { city: catalogCity, country, latitude, longitude },
          }) as Promise<LiveCatalogItem[]>
        ).catch(() => []),
      ];`;

replaceRequired(oldFullRequests, newFullRequests, "ordre des sources complètes");

if (source !== original) writeFileSync(path, source, "utf8");
console.log(
  `[Destination public catalog] destinations.$slug.tsx: ${source === original ? "déjà conforme" : "mis à jour"}`,
);
