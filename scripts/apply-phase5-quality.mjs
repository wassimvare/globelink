import fs from "node:fs";

const path = "src/lib/live-catalog.ts";
let source = fs.readFileSync(path, "utf8");

const reliabilityImport = 'import { filterReliableCatalogItems, filterReliableMapCatalogItems } from "./catalog-reliability";\n';
const qualityImport = `${reliabilityImport}import { dedupeVerifiedCatalogItems } from "./catalog-quality";\n`;
if (!source.includes(reliabilityImport)) throw new Error("[Phase 5] import reliability introuvable");
source = source.replace(reliabilityImport, qualityImport);

const before = `function uniqueCatalogRows(rows: LiveCatalogItem[]) {\n  return rows.filter((item, index, all) => {\n    const key = catalogIdentityKey(item);\n    return all.findIndex((candidate) => catalogIdentityKey(candidate) === key) === index;\n  });\n}`;
const after = `function uniqueCatalogRows(rows: LiveCatalogItem[]) {\n  const byProviderIdentity = rows.filter((item, index, all) => {\n    const key = catalogIdentityKey(item);\n    return all.findIndex((candidate) => catalogIdentityKey(candidate) === key) === index;\n  });\n  return dedupeVerifiedCatalogItems(byProviderIdentity);\n}`;
if (!source.includes(before)) throw new Error("[Phase 5] bloc dedupe introuvable");
source = source.replace(before, after);

fs.writeFileSync(path, source);
console.log("[Phase 5] Quality gate branché sur le catalogue live.");
