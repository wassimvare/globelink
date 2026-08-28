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

patchFile("src/components/CatalogImage.tsx", [
  {
    name: "Import Explorer image reliability policy",
    before: `import type { LiveCatalogItem } from "@/lib/live-catalog";`,
    after: `import type { LiveCatalogItem } from "@/lib/live-catalog";\nimport { trustedDirectCatalogImage } from "@/lib/catalog-reliability";`,
  },
  {
    name: "Only allow exact trusted catalog images",
    before: `function directImage(item: Pick<LiveCatalogItem, "image_url" | "tags">): string | null {\n  const tags = asRecord(item.tags);\n  return (\n    safeExactHttps(item.image_url) ??\n    safeExactHttps(tags.official_image_url) ??\n    safeExactHttps(tags.provider_image_url)\n  );\n}`,
    after: `function directImage(\n  item: Pick<LiveCatalogItem, "kind" | "title" | "image_url" | "tags"> &\n    Partial<Pick<LiveCatalogItem, "provider" | "source_url">>,\n): string | null {\n  const tags = asRecord(item.tags);\n  return (\n    trustedDirectCatalogImage(item, item.image_url) ??\n    trustedDirectCatalogImage(item, tags.official_image_url) ??\n    trustedDirectCatalogImage(item, tags.provider_image_url)\n  );\n}`,
  },
]);

console.log(
  "[Booking policy] Booking reste prioritaire et seules les photos exactes vérifiées sont affichées.",
);
