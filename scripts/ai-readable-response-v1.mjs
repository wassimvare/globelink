import fs from "node:fs";

function update(path, transform) {
  const file = new URL(`../${path}`, import.meta.url);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`[IA+ readable] ${path}: rendu mobile amélioré`);
  } else {
    console.log(`[IA+ readable] ${path}: déjà conforme`);
  }
}

function replaceRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[IA+ readable] Bloc introuvable: ${label}`);
  return source.replace(search, replacement);
}

update("src/routes/ai-pro.tsx", (source) => {
  if (source.includes("AI_READABLE_RESPONSE_V1")) return source;

  source = replaceRequired(
    source,
    'import ReactMarkdown from "react-markdown";',
    'import { AIReadableAnswer } from "@/components/AIReadableAnswer";\n// AI_READABLE_RESPONSE_V1',
    "import du rendu lisible",
  );

  source = replaceRequired(
    source,
    '<div className="md-body text-sm"><ReactMarkdown>{turn.content}</ReactMarkdown></div>',
    '<AIReadableAnswer content={turn.content} />',
    "réponse IA brute",
  );

  return source;
});

update("src/lib/ai-pro.functions.ts", (source) => {
  if (source.includes("AI_READABLE_OUTPUT_V1")) return source;

  source = replaceRequired(
    source,
    '      compare:\n        "Compare réellement les options dans un tableau clair. Donne avantages, limites, budget estimatif, emplacement/logistique et un verdict selon au moins deux profils de voyageurs.",',
    '      compare:\n        "Compare réellement les options sous forme de sous-sections courtes, une option par bloc. Donne avantages, limites, budget estimatif, emplacement/logistique et un verdict selon au moins deux profils de voyageurs. N’utilise jamais de tableau Markdown avec des barres verticales.",',
    "consigne comparaison",
  );

  const oldPrompt = 'Réponds directement en Markdown. Commence par une section courte "## Recommandation IA+" avec la décision ou le plan le plus utile. Puis développe avec les sections pertinentes parmi : "## Plan d\'action", "## Comparaison", "## Budget", "## Impact sur ton carnet", "## Alternatives" et "## À vérifier avant d\'agir". Adapte les sections à la demande au lieu de les forcer toutes.';
  const newPrompt = 'Réponds directement en Markdown optimisé pour un écran de téléphone. Commence par une section courte "## Recommandation IA+" avec la décision ou le plan le plus utile. Puis développe avec les sections pertinentes parmi : "## Plan d\'action", "## Comparaison", "## Budget", "## Impact sur ton carnet", "## Alternatives" et "## À vérifier avant d\'agir". Adapte les sections à la demande au lieu de les forcer toutes. N’utilise JAMAIS de tableau Markdown avec des caractères |. Pour une comparaison, fais une sous-section courte par option avec des puces. Pour un budget, fais une sous-section par journée, puis une ligne par dépense et termine par un résumé avec total, marge et budget conseillé. Garde les paragraphes courts et privilégie les listes lisibles sur mobile. // AI_READABLE_OUTPUT_V1';

  source = replaceRequired(source, oldPrompt, newPrompt, "format de sortie IA+");
  return source;
});
