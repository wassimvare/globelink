export const DEPARTURE_REPORT_TITLE = "Préparation au départ";

export const DEPARTURE_PREPARATION_PROMPT =
  "Prépare ma fiche « Avant de partir » pour le voyage enregistré : passeport ou carte d'identité, visa ou autorisation de voyage, règles de transit, validité des documents, assurance, santé, vaccins éventuels, médicaments, sécurité, arnaques, lois locales, coutumes, objets interdits, moyens de paiement, communications et contacts d'urgence. Donne une liste de vérification claire, les risques et les bons réflexes propres à la destination. Appuie les formalités sur des sources officielles récentes. Si ma nationalité, mon pays de départ ou mes escales ne sont pas précisés dans le carnet, ne suppose rien : indique ce qui reste à confirmer et demande ces précisions pour les exigences d'entrée.";

export function latestDepartureReport(notes: unknown): string | null {
  const text = String(notes ?? "");
  const marker = `## ✨ IA+ · ${DEPARTURE_REPORT_TITLE}`;
  const index = text.lastIndexOf(marker);
  if (index < 0) return null;

  const remainder = text.slice(index + marker.length);
  const next = remainder.search(/\n\s*---\s*\n## ✨ IA\+ · /);
  const content = (next >= 0 ? remainder.slice(0, next) : remainder)
    .trim()
    .replace(/^_\d{4}-\d{2}-\d{2}_\s*/, "")
    .trim();
  return content || null;
}
