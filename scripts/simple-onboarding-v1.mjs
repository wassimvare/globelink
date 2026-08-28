import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const filePath = resolve(process.cwd(), "src/routes/auth.tsx");
let source = readFileSync(filePath, "utf8");
const original = source;

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`[Simple onboarding] Motif introuvable: ${label}`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  `    router.navigate({ to: safeInternalPath(redirect), replace: true });`,
  `    router.navigate({\n      to: "/onboarding",\n      search: { next: safeInternalPath(redirect) },\n      replace: true,\n    });`,
  "redirection après connexion",
);

replaceRequired(
  `        emailRedirectTo: authRedirect("/"),`,
  `        emailRedirectTo: authRedirect("/onboarding"),`,
  "retour après inscription e-mail",
);

replaceRequired(
  `        redirectTo: authRedirect(safeInternalPath(redirect)),`,
  `        redirectTo: authRedirect(\n          "/onboarding?next=" + encodeURIComponent(safeInternalPath(redirect)),\n        ),`,
  "retour OAuth Google",
);

if (source !== original) writeFileSync(filePath, source, "utf8");
console.log(
  `[Simple onboarding] auth.tsx: ${source === original ? "déjà conforme" : "parcours connecté"}`,
);
