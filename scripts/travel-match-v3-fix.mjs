import fs from "node:fs";

const file = new URL("../src/routes/_authenticated.messages.$id.tsx", import.meta.url);
let source = fs.readFileSync(file, "utf8");
const before = source;
source = source.replace(
  "    setText((current) => current.trim() ? current : pending);",
  "    setText((current: string) => current.trim() ? current : pending);",
);
if (source !== before) {
  fs.writeFileSync(file, source);
  console.log("[Travel Match V3] Brouillon de message typé correctement.");
} else {
  console.log("[Travel Match V3] Correctif de type déjà appliqué.");
}
