import fs from "node:fs";

const path = "src/routes/map.tsx";
let source = fs.readFileSync(path, "utf8");
const before = "  MAP_PLACE_CATEGORIES,\n  SECONDARY_PLACE_CATEGORIES,";
const after = "  MAP_PLACE_CATEGORIES,\n  PRIMARY_PLACE_CATEGORIES,\n  SECONDARY_PLACE_CATEGORIES,";
if (!source.includes(before)) throw new Error("[Phase 4] import Explorer introuvable");
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("[Phase 4] PRIMARY_PLACE_CATEGORIES importé depuis le domaine Explorer.");
