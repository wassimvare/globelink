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
      throw new Error(`[Open data] Motif introuvable dans ${relativePath}: ${replacement.name}`);
    }
    source = source.replace(replacement.before, replacement.after);
    changed = true;
  }

  if (changed) writeFileSync(filePath, source, "utf8");
  console.log(`[Open data] ${relativePath}: ${changed ? "mis à jour" : "déjà conforme"}`);
}

patchFile("src/lib/public-travel-catalog.functions.ts", [
  {
    name: "remove dead Overpass NCHC endpoint",
    before: `  "https://overpass.openstreetmap.fr/api/interpreter",\n  "https://overpass.nchc.org.tw/api/interpreter",`,
    after: `  "https://overpass.openstreetmap.fr/api/interpreter",`,
  },
]);

patchFile("src/components/CountrySheet.tsx", [
  {
    name: "TanStack server function hook",
    before: `import { Link } from "@tanstack/react-router";`,
    after: `import { Link } from "@tanstack/react-router";\nimport { useServerFn } from "@tanstack/react-start";`,
  },
  {
    name: "public open data imports",
    before: `import { DestinationImage } from "@/components/DestinationImage";`,
    after: `import { DestinationImage } from "@/components/DestinationImage";\nimport { getPublicExchangeRate, getPublicWeather } from "@/lib/public-open-data.functions";`,
  },
  {
    name: "country public weather and FX queries",
    before: `  const c = code ? COUNTRY_BY_CODE.get(code) : null;`,
    after: `  const c = code ? COUNTRY_BY_CODE.get(code) : null;\n  const loadPublicWeather = useServerFn(getPublicWeather);\n  const loadPublicExchangeRate = useServerFn(getPublicExchangeRate);\n  const { data: publicWeather } = useQuery({\n    queryKey: ["country-public-weather", c?.code],\n    enabled: !!c,\n    queryFn: () =>\n      loadPublicWeather({\n        data: { latitude: c!.center[0], longitude: c!.center[1] },\n      }),\n    staleTime: 15 * 60_000,\n    retry: 1,\n  });\n  const { data: publicExchangeRate } = useQuery({\n    queryKey: ["country-public-fx", c?.currency],\n    enabled: !!c && c.currency !== "EUR",\n    queryFn: () =>\n      loadPublicExchangeRate({\n        data: { base: "EUR", quote: c!.currency },\n      }),\n    staleTime: 6 * 60 * 60_000,\n    retry: 1,\n  });`,
  },
  {
    name: "live country weather",
    before: `                <FactCard icon={CloudSun} label="Météo" value={c.weatherNow} />`,
    after: `                <FactCard\n                  icon={CloudSun}\n                  label="Météo"\n                  value={\n                    publicWeather\n                      ? \`\${publicWeather.summary} · \${Math.round(publicWeather.temperatureC)}°C\`\n                      : c.weatherNow\n                  }\n                />`,
  },
  {
    name: "live FX and attribution",
    before: `                <FactCard icon={Wallet} label="Monnaie" value={c.currency} />\n              </div>\n\n              <div className="mt-5 grid gap-2 sm:grid-cols-2">`,
    after: `                <FactCard\n                  icon={Wallet}\n                  label="Monnaie"\n                  value={\n                    publicExchangeRate\n                      ? \`\${c.currency} · 1 € ≈ \${publicExchangeRate.rate.toLocaleString("fr-FR", {\n                          maximumFractionDigits: publicExchangeRate.rate >= 100 ? 0 : 4,\n                        })} \${c.currency}\`\n                      : c.currency\n                  }\n                />\n              </div>\n\n              {(publicWeather || publicExchangeRate) && (\n                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">\n                  {publicWeather && (\n                    <a\n                      href={publicWeather.sourceUrl}\n                      target="_blank"\n                      rel="noopener noreferrer"\n                      className="underline underline-offset-2 hover:text-foreground"\n                    >\n                      Météo · MET Norway\n                    </a>\n                  )}\n                  {publicExchangeRate && (\n                    <a\n                      href={publicExchangeRate.sourceUrl}\n                      target="_blank"\n                      rel="noopener noreferrer"\n                      className="underline underline-offset-2 hover:text-foreground"\n                    >\n                      Taux · Frankfurter\n                    </a>\n                  )}\n                </div>\n              )}\n\n              <div className="mt-5 grid gap-2 sm:grid-cols-2">`,
  },
]);

console.log("[Open data] MET Norway + Frankfurter connectés, Overpass nettoyé.");
