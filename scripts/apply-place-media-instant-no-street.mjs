import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function writeIfChanged(path, source, original) {
  if (source !== original) writeFileSync(path, source, "utf8");
}

const publicPath = resolve(process.cwd(), "src/lib/public-place-media.functions.ts");
let publicSource = readFileSync(publicPath, "utf8");
const publicOriginal = publicSource;

// Remove the KartaView/street-view helper block after the older compatibility
// patches have run. Keep the official logo helper that is inserted afterwards.
const streetStart = publicSource.indexOf("function bearingDegrees(");
if (streetStart >= 0) {
  const logoMarker = publicSource.indexOf("function htmlAttribute(", streetStart);
  const validateMarker = publicSource.indexOf(
    "function validateInput(raw: PublicPlaceMediaInput): PublicPlaceMediaInput {",
    streetStart,
  );
  const streetEnd = logoMarker > streetStart ? logoMarker : validateMarker;
  if (streetEnd > streetStart) {
    publicSource = publicSource.slice(0, streetStart) + publicSource.slice(streetEnd);
  }
}

publicSource = publicSource
  .replace(/ \| "kartaview"/g, "")
  .replace(
    /\(await resolveFromNominatim\(data\)\) \?\?\s*\(await resolveKartaView\(data\)\) \?\?/g,
    "(await resolveFromNominatim(data)) ??",
  )
  .replace(/"public-place-media-v4-place-logo"/g, '"public-place-media-v5-no-street-instant"')
  .replace(/"public-place-media-v3-hotel-logo"/g, '"public-place-media-v5-no-street-instant"')
  .replace(/"public-place-media-v2-kartaview"/g, '"public-place-media-v5-no-street-instant"')
  .replace(/"public-place-media-v1"/g, '"public-place-media-v5-no-street-instant"');

if (publicSource.includes("resolveKartaView(") || publicSource.includes('"kartaview"')) {
  throw new Error("[Place media instant] KartaView est encore présent après nettoyage");
}
writeIfChanged(publicPath, publicSource, publicOriginal);

const imagePath = resolve(process.cwd(), "src/components/CatalogImage.tsx");
let imageSource = readFileSync(imagePath, "utf8");
const imageOriginal = imageSource;

// On an opened place sheet, run the verified resolver and the keyless public
// resolver in parallel instead of waiting for one to fail before starting the next.
imageSource = imageSource.replace(
  "  const primaryExhausted = canResolveSource && !isFetching && (!primaryUrl || primaryFailed);\n",
  "",
);
imageSource = imageSource.replace(
  "    enabled: primaryExhausted && priority,\n",
  "    enabled: priority && canResolveSource && (!exactDirect || directFailed),\n",
);

// Never show a visible loading placeholder. The polished identity/logo fallback is
// rendered instantly and is replaced by the real verified image as soon as it is ready.
imageSource = imageSource.replace(
  '      {item.kind !== "deal" && !lookingForPhoto ? (\n',
  '      {item.kind !== "deal" ? (\n',
);
writeIfChanged(imagePath, imageSource, imageOriginal);

const mapPath = resolve(process.cwd(), "src/routes/map.tsx");
let mapSource = readFileSync(mapPath, "utf8");
const mapOriginal = mapSource;

// A direct user interaction should warm the complete resolver, not only fast
// metadata. Background viewport warming stays lightweight.
mapSource = mapSource.replace(
  "resolvePlaceMedia({ data: { ...input, fastOnly: true } })",
  "resolvePlaceMedia({ data: { ...input, fastOnly: !highPriority } })",
);
mapSource = mapSource.replace(
  "Math.min(2, queue.length)",
  "Math.min(3, queue.length)",
);
mapSource = mapSource.replace(
  /(void Promise\.allSettled\(workers\);\n\s*\}, )600(\);)/,
  "$1120$2",
);
writeIfChanged(mapPath, mapSource, mapOriginal);

console.log(
  "[Place media instant] vues de rue supprimées; préchargement accéléré et recherches parallélisées.",
);
