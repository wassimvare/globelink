import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const filePath = resolve(process.cwd(), "src/components/CatalogImage.tsx");
let source = readFileSync(filePath, "utf8");
const original = source;

if (!source.includes("function hotelIdentityInitials(")) {
  const marker = `export function CatalogImage({`;
  const helper = `function hotelIdentityInitials(title: string) {\n  const words = title\n    .normalize("NFKD")\n    .replace(/[\\u0300-\\u036f]/g, "")\n    .replace(/[^a-zA-Z0-9 ]+/g, " ")\n    .split(/\\s+/)\n    .filter(Boolean)\n    .filter((word) => !["hotel", "hotels", "hostel", "motel", "resort", "auberge"].includes(word.toLowerCase()));\n  const useful = words.filter((word) => !["le", "la", "les", "de", "des", "du", "the", "and"].includes(word.toLowerCase()));\n  const picked = useful.length ? useful : words;\n  const initials = picked.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");\n  return initials || "H";\n}\n\n`;
  if (!source.includes(marker)) throw new Error("[Hotel identity] CatalogImage insertion point introuvable");
  source = source.replace(marker, `${helper}${marker}`);
}

const activeMediaMarker = `  const activeMedia =\n    resolvedUrl && fallbackCandidate === resolvedUrl\n      ? fallbackMedia\n      : resolvedUrl && publicCandidate === resolvedUrl\n        ? publicMedia\n        : resolvedUrl && resolvedCandidate === resolvedUrl\n          ? resolvedMedia\n          : null;`;
const activeMediaReplacement = `${activeMediaMarker}\n  const isLogoMedia =\n    activeMedia?.source === "official-logo" || activeMedia?.source === "wikidata-logo";`;
if (!source.includes("const isLogoMedia =")) {
  if (!source.includes(activeMediaMarker)) throw new Error("[Hotel identity] activeMedia introuvable");
  source = source.replace(activeMediaMarker, activeMediaReplacement);
}

source = source.replace(
  `        className={className}\n`,
  `        className={\n          isLogoMedia\n            ? \`${"${className.replace(/\\bobject-cover\\b/g, \"\")} bg-white/95 p-8 object-contain"}\`\n            : className\n        }\n`,
);

source = source.replace(
  `          Photo ·{" "}\n`,
  `          {isLogoMedia ? "Logo · " : "Photo · "}\n`,
);

const oldPlaceholder = `      <span className="text-4xl" aria-hidden="true">\n        {placeholder.emoji}\n      </span>\n      <span className="px-4 text-xs font-semibold text-foreground/75">\n        {lookingForPhoto ? "Recherche de la photo officielle du lieu…" : "Aucune photo officielle vérifiée"}\n      </span>\n      <span className="px-4 text-[10px]">\n        {lookingForPhoto\n          ? "Google Places · OpenStreetMap · site officiel"\n          : \`${"${placeholder.label} · aucune image générique utilisée"}\`}\n      </span>`;
const newPlaceholder = `      {item.kind === "hotel" && !lookingForPhoto ? (\n        <>\n          <div\n            className="grid h-20 min-w-20 place-items-center rounded-2xl border border-primary/25 bg-background/95 px-5 text-2xl font-black tracking-tight text-primary shadow-soft"\n            aria-hidden="true"\n          >\n            {hotelIdentityInitials(item.title)}\n          </div>\n          <span className="max-w-[88%] px-4 text-sm font-bold text-foreground">{item.title}</span>\n          <span className="px-4 text-[10px]">\n            Logo officiel introuvable · identité de l’hôtel affichée en remplacement\n          </span>\n        </>\n      ) : (\n        <>\n          <span className="text-4xl" aria-hidden="true">\n            {placeholder.emoji}\n          </span>\n          <span className="px-4 text-xs font-semibold text-foreground/75">\n            {lookingForPhoto ? "Recherche de la photo officielle du lieu…" : "Aucune photo officielle vérifiée"}\n          </span>\n          <span className="px-4 text-[10px]">\n            {lookingForPhoto\n              ? "Google Places · OpenStreetMap · site officiel"\n              : \`${"${placeholder.label} · aucune image générique utilisée"}\`}\n          </span>\n        </>\n      )}`;
if (!source.includes(newPlaceholder)) {
  if (!source.includes(oldPlaceholder)) throw new Error("[Hotel identity] placeholder introuvable");
  source = source.replace(oldPlaceholder, newPlaceholder);
}

if (source !== original) writeFileSync(filePath, source, "utf8");
console.log(
  `[Hotel identity] CatalogImage.tsx: ${source === original ? "déjà conforme" : "fallback identité hôtel activé"}`,
);
