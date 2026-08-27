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

// Important : ne jamais masquer tous les hôtels si l'API Booking n'est pas configurée.
// Les hôtels traçables restent visibles sur la carte. Les fiches Booking officielles,
// lorsqu'elles sont disponibles, gardent la priorité et leurs photos Booking sont utilisées.
patchFile("src/components/CatalogImage.tsx", [
  {
    name: "Prefer verified Booking direct hotel photos",
    before: `function directImage(item: Pick<LiveCatalogItem, "image_url" | "tags">): string | null {\n  const tags = asRecord(item.tags);\n  return (\n    safeExactHttps(item.image_url) ??\n    safeExactHttps(tags.official_image_url) ??\n    safeExactHttps(tags.provider_image_url)\n  );\n}`,
    after: `const BOOKING_IMAGE_HOST = /(^|\\.)bstatic\\.com$|(^|\\.)booking\\.com$/i;\nconst BOOKING_PROVIDERS = new Set(["booking", "booking-com", "booking.com"]);\n\nfunction directImage(\n  item: Pick<LiveCatalogItem, "kind" | "image_url" | "tags">,\n): string | null {\n  const tags = asRecord(item.tags);\n  const candidates = [item.image_url, tags.official_image_url, tags.provider_image_url];\n\n  // Pour les hôtels, une photo directe n'est acceptée comme Booking que si le\n  // fournisseur ET le domaine de l'image correspondent réellement à Booking.\n  // Sinon on laisse le résolveur de média chercher une photo vérifiée du lieu\n  // (Google Places/site officiel) plutôt que de montrer une image douteuse.\n  if (item.kind === "hotel") {\n    const provider = String(\n      tags.official_source_provider ??\n        tags.strict_source_provider ??\n        tags.primary_source_provider ??\n        "",\n    )\n      .trim()\n      .toLowerCase();\n    if (BOOKING_PROVIDERS.has(provider)) {\n      for (const candidate of candidates) {\n        const url = safeExactHttps(candidate);\n        if (!url) continue;\n        try {\n          if (BOOKING_IMAGE_HOST.test(new URL(url).hostname)) return url;\n        } catch {\n          continue;\n        }\n      }\n    }\n    return null;\n  }\n\n  for (const candidate of candidates) {\n    const url = safeExactHttps(candidate);\n    if (url) return url;\n  }\n  return null;\n}`,
  },
]);

console.log("[Booking policy] Hôtels conservés sur la carte, Booking prioritaire quand vérifié.");
