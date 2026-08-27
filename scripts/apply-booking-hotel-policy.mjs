import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function patchFile(relativePath, replacements) {
  const filePath = resolve(root, relativePath);
  let source = readFileSync(filePath, "utf8");
  let changed = false;

  for (const replacement of replacements) {
    if (source.includes(replacement.after)) continue;
    if (!source.includes(replacement.before)) {
      throw new Error(`[Booking policy] Motif introuvable dans ${relativePath}: ${replacement.name}`);
    }
    source = source.replace(replacement.before, replacement.after);
    changed = true;
  }

  if (changed) writeFileSync(filePath, source, "utf8");
  console.log(`[Booking policy] ${relativePath}: ${changed ? "mis à jour" : "déjà conforme"}`);
}

patchFile("src/lib/catalog-source-routing.ts", [
  {
    name: "Booking-only hotel visibility",
    before: `  if (item.kind === "hotel") {\n    return ["hotel", "hostel", "guest-house", "motel", "resort", "apartment", "camp-site"].includes(\n      category,\n    );\n  }`,
    after: `  // Hôtels GlobeLink : uniquement des fiches Booking.com réellement vérifiées.\n  // Si la fiche n'a pas déjà passé isStrictOfficialCatalogItem() ci-dessus,\n  // elle ne doit pas être exposée comme hôtel.\n  if (item.kind === "hotel") return false;`,
  },
]);

patchFile("src/components/CatalogImage.tsx", [
  {
    name: "Booking-only direct hotel photos",
    before: `function directImage(item: Pick<LiveCatalogItem, "image_url" | "tags">): string | null {\n  const tags = asRecord(item.tags);\n  return (\n    safeExactHttps(item.image_url) ??\n    safeExactHttps(tags.official_image_url) ??\n    safeExactHttps(tags.provider_image_url)\n  );\n}`,
    after: `const BOOKING_IMAGE_HOST = /(^|\\.)bstatic\\.com$|(^|\\.)booking\\.com$/i;\nconst BOOKING_PROVIDERS = new Set(["booking", "booking-com", "booking.com"]);\n\nfunction directImage(\n  item: Pick<LiveCatalogItem, "kind" | "image_url" | "tags">,\n): string | null {\n  const tags = asRecord(item.tags);\n  const candidates = [item.image_url, tags.official_image_url, tags.provider_image_url];\n\n  for (const candidate of candidates) {\n    const url = safeExactHttps(candidate);\n    if (!url) continue;\n    if (item.kind !== "hotel") return url;\n\n    const provider = String(\n      tags.official_source_provider ??\n        tags.strict_source_provider ??\n        tags.primary_source_provider ??\n        "",\n    )\n      .trim()\n      .toLowerCase();\n    if (!BOOKING_PROVIDERS.has(provider)) continue;\n    try {\n      if (BOOKING_IMAGE_HOST.test(new URL(url).hostname)) return url;\n    } catch {\n      continue;\n    }\n  }\n  return null;\n}`,
  },
  {
    name: "Disable non-Booking media fallback for hotels",
    before: `  const canResolveSource =\n    (!exactDirect || directFailed) &&\n    (!!lookup ||\n      !!primaryInput.wikidata ||\n      !!primaryInput.wikipedia ||\n      !!primaryInput.wikimediaCommons);`,
    after: `  const canResolveSource =\n    item.kind !== "hotel" &&\n    (!exactDirect || directFailed) &&\n    (!!lookup ||\n      !!primaryInput.wikidata ||\n      !!primaryInput.wikipedia ||\n      !!primaryInput.wikimediaCommons);`,
  },
  {
    name: "Booking-specific empty photo label",
    before: `        {isFetching || isFetchingFallback\n          ? "Recherche de la photo officielle du lieu…"\n          : "Aucune photo officielle vérifiée"}`,
    after: `        {item.kind === "hotel"\n          ? "Aucune photo Booking.com vérifiée"\n          : isFetching || isFetchingFallback\n            ? "Recherche de la photo officielle du lieu…"\n            : "Aucune photo officielle vérifiée"}`,
  },
]);

console.log("[Booking policy] Politique hôtels Booking.com appliquée.");
