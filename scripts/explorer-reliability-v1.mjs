import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function patchFile(path, patcher, label) {
  const filePath = resolve(process.cwd(), path);
  const source = readFileSync(filePath, "utf8");
  const next = patcher(source);
  if (next !== source) writeFileSync(filePath, next, "utf8");
  console.log(`[Explorer reliability] ${label}: ${next === source ? "déjà conforme" : "mis à jour"}`);
}

patchFile(
  "src/lib/live-catalog.ts",
  (input) => {
    let source = input;
    if (!source.includes('from "./catalog-reliability"')) {
      const marker = 'import { curatedActivitiesForCountry, dailyWorldActivitySelection } from "./world-activities";';
      if (!source.includes(marker)) throw new Error("[Explorer reliability] import live-catalog introuvable");
      source = source.replace(
        marker,
        'import { filterReliableCatalogItems, filterReliableMapCatalogItems } from "./catalog-reliability";\n' + marker,
      );
    }

    const oldVisible = `function visibleCatalogRows(rows: LiveCatalogItem[]) {\n  return filterTrustedVisibleCatalogItems(rows);\n}`;
    const newVisible = `function visibleCatalogRows(rows: LiveCatalogItem[]) {\n  return filterReliableCatalogItems(filterTrustedVisibleCatalogItems(rows));\n}`;
    if (!source.includes(newVisible)) {
      if (!source.includes(oldVisible)) throw new Error("[Explorer reliability] filtre catalogue introuvable");
      source = source.replace(oldVisible, newVisible);
    }

    const persistedOld = `    const rows = uniqueCatalogRows(\n      visibleCatalogRows(((data ?? []) as LiveCatalogItem[]).map(enrichCatalogRow)),\n    );`;
    const persistedNew = `    const rows = uniqueCatalogRows(\n      filterReliableMapCatalogItems(\n        visibleCatalogRows(((data ?? []) as LiveCatalogItem[]).map(enrichCatalogRow)),\n      ),\n    );`;
    if (!source.includes(persistedNew)) {
      if (!source.includes(persistedOld)) throw new Error("[Explorer reliability] filtre viewport persisté introuvable");
      source = source.replace(persistedOld, persistedNew);
    }

    const fastOld = `    const unique = uniqueCatalogRows(visibleCatalogRows(rows.map(enrichCatalogRow)));`;
    const fastNew = `    const unique = uniqueCatalogRows(\n      filterReliableMapCatalogItems(visibleCatalogRows(rows.map(enrichCatalogRow))),\n    );`;
    if (!source.includes(fastNew)) {
      if (!source.includes(fastOld)) throw new Error("[Explorer reliability] filtre viewport rapide introuvable");
      source = source.replace(fastOld, fastNew);
    }

    const liveOld = `  const unique = uniqueCatalogRows(visibleCatalogRows(rows.map(enrichCatalogRow)));`;
    const liveNew = `  const unique = uniqueCatalogRows(\n    filterReliableMapCatalogItems(visibleCatalogRows(rows.map(enrichCatalogRow))),\n  );`;
    if (!source.includes(liveNew)) {
      if (!source.includes(liveOld)) throw new Error("[Explorer reliability] filtre viewport live introuvable");
      source = source.replace(liveOld, liveNew);
    }

    return source;
  },
  "sources et coordonnées",
);

patchFile(
  "src/components/CatalogImage.tsx",
  (input) => {
    let source = input;
    if (!source.includes('from "@/lib/catalog-reliability"')) {
      const marker = 'import type { LiveCatalogItem } from "@/lib/live-catalog";';
      if (!source.includes(marker)) throw new Error("[Explorer reliability] import CatalogImage introuvable");
      source = source.replace(
        marker,
        `${marker}\nimport { trustedDirectCatalogImage } from "@/lib/catalog-reliability";`,
      );
    }

    const oldDirect = `function directImage(item: Pick<LiveCatalogItem, "image_url" | "tags">): string | null {\n  const tags = asRecord(item.tags);\n  return (\n    safeExactHttps(item.image_url) ??\n    safeExactHttps(tags.official_image_url) ??\n    safeExactHttps(tags.provider_image_url)\n  );\n}`;
    const newDirect = `function directImage(\n  item: Pick<LiveCatalogItem, "kind" | "title" | "image_url" | "tags"> &\n    Partial<Pick<LiveCatalogItem, "provider" | "source_url">>,\n): string | null {\n  const tags = asRecord(item.tags);\n  return (\n    trustedDirectCatalogImage(item, item.image_url) ??\n    trustedDirectCatalogImage(item, tags.official_image_url) ??\n    trustedDirectCatalogImage(item, tags.provider_image_url)\n  );\n}`;
    if (!source.includes(newDirect)) {
      if (!source.includes(oldDirect)) throw new Error("[Explorer reliability] directImage introuvable");
      source = source.replace(oldDirect, newDirect);
    }

    return source;
  },
  "photos exactes uniquement",
);

patchFile(
  "src/lib/public-place-media.functions.ts",
  (input) => {
    let source = input;
    // A nearby street-view image can be real while still showing the wrong establishment.
    // Keep the helper code harmless if another legacy patch adds it, but never select it.
    source = source.replace(
      `(await resolveFromNominatim(data)) ??\n      (await resolveKartaView(data)) ??\n      ({ url: null, source: null, matchedName: null, attributions: [] } satisfies PublicPlaceMediaResult)`,
      `(await resolveFromNominatim(data)) ??\n      ({ url: null, source: null, matchedName: null, attributions: [] } satisfies PublicPlaceMediaResult)`,
    );
    return source;
  },
  "aucune vue de rue approximative",
);
