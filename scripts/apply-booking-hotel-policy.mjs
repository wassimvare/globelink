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

// Booking reste prioritaire quand une vraie photo Booking est disponible, mais
// l'absence de Booking ne doit plus supprimer les photos exactes issues de
// Wikidata/Wikimedia/Wikipedia ou d'une fiche publique vérifiée du lieu.
patchFile("src/components/CatalogImage.tsx", [
  {
    name: "Prefer Booking while allowing verified public hotel photos",
    before: `function directImage(item: Pick<LiveCatalogItem, "image_url" | "tags">): string | null {\n  const tags = asRecord(item.tags);\n  return (\n    safeExactHttps(item.image_url) ??\n    safeExactHttps(tags.official_image_url) ??\n    safeExactHttps(tags.provider_image_url)\n  );\n}`,
    after: `const BOOKING_IMAGE_HOST = /(^|\\.)bstatic\\.com$|(^|\\.)booking\\.com$/i;\nconst BOOKING_PROVIDERS = new Set(["booking", "booking-com", "booking.com"]);\nconst VERIFIED_PUBLIC_IMAGE_HOST =\n  /(^|\\.)(upload\\.wikimedia\\.org|commons\\.wikimedia\\.org|wikipedia\\.org)$/i;\n\nfunction directImage(\n  item: Pick<LiveCatalogItem, "kind" | "image_url" | "tags">,\n): string | null {\n  const tags = asRecord(item.tags);\n  const candidates = [item.image_url, tags.official_image_url, tags.provider_image_url];\n\n  if (item.kind === "hotel") {\n    const provider = String(\n      tags.official_source_provider ??\n        tags.strict_source_provider ??\n        tags.primary_source_provider ??\n        "",\n    )\n      .trim()\n      .toLowerCase();\n\n    if (BOOKING_PROVIDERS.has(provider)) {\n      for (const candidate of candidates) {\n        const url = safeExactHttps(candidate);\n        if (!url) continue;\n        try {\n          if (BOOKING_IMAGE_HOST.test(new URL(url).hostname)) return url;\n        } catch {\n          continue;\n        }\n      }\n    }\n\n    const publicProof =\n      tags.verified_real_place === true ||\n      typeof tags.wikidata === "string" ||\n      typeof tags.wikipedia === "string" ||\n      typeof tags.wikimedia_commons === "string" ||\n      String(tags.public_api_provider ?? "").toLowerCase() === "wikidata";\n    if (publicProof) {\n      for (const candidate of candidates) {\n        const url = safeExactHttps(candidate);\n        if (!url) continue;\n        try {\n          if (VERIFIED_PUBLIC_IMAGE_HOST.test(new URL(url).hostname)) return url;\n        } catch {\n          continue;\n        }\n      }\n    }\n    return null;\n  }\n\n  for (const candidate of candidates) {\n    const url = safeExactHttps(candidate);\n    if (url) return url;\n  }\n  return null;\n}`,
  },
]);

console.log(
  "[Booking policy] Booking prioritaire; photos publiques vérifiées autorisées pour les hôtels.",
);
