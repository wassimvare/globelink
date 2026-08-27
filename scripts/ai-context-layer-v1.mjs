import fs from "node:fs";

function update(path, transform) {
  const file = new URL(`../${path}`, import.meta.url);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`[GlobeLink IA layer] ${path}: mis à jour`);
  } else {
    console.log(`[GlobeLink IA layer] ${path}: déjà conforme`);
  }
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`[ai-context-v1] Bloc introuvable: ${label}`);
  return source.replace(search, replacement);
}

update("src/routes/ai-trip.tsx", (source) => {
  if (source.includes("AI_CONTEXT_LAYER_V1_FREE")) return source;
  source = replaceRequired(
    source,
    'const search = z.object({ destination: z.string().optional() });',
    'const search = z.object({\n  destination: z.string().max(180).optional(),\n  prompt: z.string().max(1_200).optional(),\n});\n// AI_CONTEXT_LAYER_V1_FREE',
    "free search schema",
  );
  source = replaceRequired(
    source,
    '  const { destination } = Route.useSearch();',
    '  const { destination, prompt } = Route.useSearch();',
    "free search read",
  );
  source = replaceRequired(
    source,
    `  const [query, setQuery] = useState(\n    destination\n      ? \`Donne-moi des idées pour préparer un voyage à \${destination}.\`\n      : "",\n  );`,
    `  const [query, setQuery] = useState(\n    prompt?.trim()\n      ? prompt.trim()\n      : destination\n        ? \`Donne-moi des idées pour préparer un voyage à \${destination}.\`\n        : "",\n  );`,
    "free contextual prompt",
  );
  return source;
});

update("src/routes/ai-pro.tsx", (source) => {
  if (source.includes("AI_CONTEXT_LAYER_V1_PRO")) return source;
  source = replaceRequired(
    source,
    'import ReactMarkdown from "react-markdown";',
    'import ReactMarkdown from "react-markdown";\nimport { z } from "zod";',
    "pro zod import",
  );
  source = replaceRequired(
    source,
    'type Mode = (typeof MODES)[number]["id"];',
    'type Mode = (typeof MODES)[number]["id"];\nconst aiProSearch = z.object({\n  prompt: z.string().max(3_000).optional(),\n  mode: z.enum(["research", "compare", "plan", "safety"]).optional(),\n  tripId: z.string().uuid().optional(),\n});\n// AI_CONTEXT_LAYER_V1_PRO',
    "pro search schema",
  );
  source = replaceRequired(
    source,
    '  component: AiPlusPage,\n});',
    '  validateSearch: (search) => aiProSearch.parse(search),\n  component: AiPlusPage,\n});',
    "pro validate search",
  );
  source = replaceRequired(
    source,
    'function AiPlusPage() {\n  const { user } = useAuth();',
    'function AiPlusPage() {\n  const { prompt, mode: requestedMode, tripId } = Route.useSearch();\n  const { user } = useAuth();',
    "pro read search",
  );
  source = replaceRequired(
    source,
    '  const [query, setQuery] = useState("");\n  const [mode, setMode] = useState<Mode>("plan");',
    '  const [query, setQuery] = useState(prompt?.trim() || "");\n  const [mode, setMode] = useState<Mode>(requestedMode ?? "plan");',
    "pro initial context",
  );
  source = replaceRequired(
    source,
    `    queryFn: async () => {\n      const { data, error } = await supabase\n        .from("trips")\n        .select("id, title, city, country, budget, starts_on, ends_on, status")\n        .eq("user_id", user!.id)\n        .order("created_at", { ascending: false })\n        .limit(1)\n        .maybeSingle();\n      if (error) throw error;\n      return data;\n    },`,
    `    queryFn: async () => {\n      let request = supabase\n        .from("trips")\n        .select("id, title, city, country, budget, starts_on, ends_on, status")\n        .eq("user_id", user!.id);\n      if (tripId) request = request.eq("id", tripId);\n      const { data, error } = await request\n        .order("created_at", { ascending: false })\n        .limit(1)\n        .maybeSingle();\n      if (error) throw error;\n      return data;\n    },`,
    "pro selected trip query",
  );
  source = source.replace(
    '    queryKey: ["ai-plus-current-trip", user?.id],',
    '    queryKey: ["ai-plus-current-trip", user?.id, tripId],',
  );
  source = replaceRequired(
    source,
    '          history: turns.slice(-6).map(({ role, content }) => ({ role, content })),\n        },',
    '          history: turns.slice(-6).map(({ role, content }) => ({ role, content })),\n          tripId: tripId || undefined,\n        },',
    "pro send selected trip",
  );
  return source;
});

update("src/lib/ai-pro.functions.ts", (source) => {
  if (source.includes("AI_CONTEXT_LAYER_V1_SERVER")) return source;
  source = replaceRequired(
    source,
    'type ProInput = { query: string; mode?: string; history?: ProMessage[] };',
    'type ProInput = { query: string; mode?: string; history?: ProMessage[]; tripId?: string };\n// AI_CONTEXT_LAYER_V1_SERVER',
    "server input",
  );
  source = replaceRequired(
    source,
    'async function loadConnectedTrip(db: any, userId: string): Promise<{',
    'async function loadConnectedTrip(db: any, userId: string, tripId?: string): Promise<{',
    "connected trip signature",
  );
  source = replaceRequired(
    source,
    `  const { data: trip } = await db\n    .from("trips")\n    .select("id, title, city, country, budget, starts_on, ends_on, status, notes")\n    .eq("user_id", userId)\n    .order("created_at", { ascending: false })\n    .limit(1)\n    .maybeSingle();`,
    `  let tripRequest = db\n    .from("trips")\n    .select("id, title, city, country, budget, starts_on, ends_on, status, notes")\n    .eq("user_id", userId);\n  if (tripId) tripRequest = tripRequest.eq("id", tripId);\n  const { data: trip } = await tripRequest\n    .order("created_at", { ascending: false })\n    .limit(1)\n    .maybeSingle();`,
    "connected trip selection",
  );
  source = replaceRequired(
    source,
    '    return { query, mode, history };',
    '    const tripId = cleanText(data.tripId, 80) || undefined;\n    return { query, mode, history, tripId };',
    "server validator trip id",
  );
  source = replaceRequired(
    source,
    '    const connectedTrip = await loadConnectedTrip(db, userId);',
    '    const connectedTrip = await loadConnectedTrip(db, userId, data.tripId);',
    "server selected trip",
  );
  return source;
});

update("src/routes/destinations.$slug.tsx", (source) => {
  if (source.includes("AI_CONTEXT_LAYER_V1_DESTINATION")) return source;
  source = replaceRequired(
    source,
    'import { AddToTripButton } from "@/components/AddToTripButton";',
    'import { AddToTripButton } from "@/components/AddToTripButton";\nimport { AIContextActions } from "@/components/AIContextActions";\n// AI_CONTEXT_LAYER_V1_DESTINATION',
    "destination AI import",
  );
  const addBlock = `              <AddToTripButton\n                item={{\n                  title,\n                  city: catalogCity,\n                  country,\n                  lat: latitude,\n                  lng: longitude,\n                  kind: "stop",\n                  source: "Destination GlobeLink",\n                }}\n                label="Ajouter cette destination"\n                variant="outline"\n                className="rounded-full border-white/40 bg-black/20 text-white hover:bg-white/10 hover:text-white"\n              />`;
  source = replaceRequired(
    source,
    addBlock,
    `${addBlock}\n              <AIContextActions\n                destination={[catalogCity, country].filter(Boolean).join(", ")}\n                freePrompt={\`Donne-moi les meilleurs conseils rapides pour préparer un voyage à \${title}, avec les incontournables et les erreurs à éviter.\`}\n                proPrompt={\`Recherche et organise un voyage à \${title}. Compare les meilleurs quartiers, hôtels, restaurants et activités adaptés à mes dates et à mon budget.\`}\n                proMode="research"\n                freeLabel="Demander à GlobeLink"\n                proLabel="Préparer avec IA+"\n                dark\n              />`,
    "destination hero AI",
  );
  return source;
});

update("src/routes/activities.$slug.tsx", (source) => {
  if (source.includes("AI_CONTEXT_LAYER_V1_ACTIVITY")) return source;
  source = replaceRequired(
    source,
    'import { AddToTripButton } from "@/components/AddToTripButton";',
    'import { AddToTripButton } from "@/components/AddToTripButton";\nimport { AIContextActions } from "@/components/AIContextActions";\n// AI_CONTEXT_LAYER_V1_ACTIVITY',
    "activity AI import",
  );
  source = replaceRequired(
    source,
    '              {place.description ? (',
    `              <AIContextActions\n                destination={[place.city, place.country].filter(Boolean).join(", ")}\n                freePrompt={\`Que dois-je savoir sur \${place.name} à \${[place.city, place.country].filter(Boolean).join(", ") || "cette destination"} ? Donne-moi des conseils rapides et pratiques.\`}\n                proPrompt={String(place.kind || place.category).toLowerCase().includes("hotel")\n                  ? \`Compare \${place.name} aux meilleures alternatives proches pour mon voyage : prix, emplacement, avantages, limites et verdict.\`\n                  : \`Recherche et vérifie \${place.name} pour mon voyage : intérêt, horaires ou conditions à confirmer, prix indicatifs, alternatives proches et recommandation finale.\`}\n                proMode={String(place.kind || place.category).toLowerCase().includes("hotel") ? "compare" : "research"}\n                proLabel={String(place.kind || place.category).toLowerCase().includes("hotel") ? "Comparer avec IA+" : "Vérifier avec IA+"}\n                className="mt-3"\n              />\n              {place.description ? (`,
    "activity contextual AI",
  );
  return source;
});

update("src/routes/deals.$slug.tsx", (source) => {
  if (source.includes("AI_CONTEXT_LAYER_V1_DEAL")) return source;
  source = replaceRequired(
    source,
    'import { AddToTripButton } from "@/components/AddToTripButton";',
    'import { AddToTripButton } from "@/components/AddToTripButton";\nimport { AIContextActions } from "@/components/AIContextActions";\n// AI_CONTEXT_LAYER_V1_DEAL',
    "deal AI import",
  );
  source = replaceRequired(
    source,
    '            <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">',
    `            <AIContextActions\n              destination={[deal.city, deal.country].filter(Boolean).join(", ")}\n              freePrompt={\`Explique-moi rapidement si l’offre \"\${deal.title}\" semble intéressante pour un voyage à \${[deal.city, deal.country].filter(Boolean).join(", ") || "cette destination"}, et quels points je dois vérifier.\`}\n              proPrompt={\`Compare l’offre \"\${deal.title}\" avec les meilleures alternatives actuelles pour mon voyage. Vérifie le rapport qualité-prix, les contraintes et donne un verdict clair.\`}\n              proMode="compare"\n              proLabel="Comparer cette offre avec IA+"\n              className="mt-3"\n            />\n\n            <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">`,
    "deal contextual AI",
  );
  return source;
});

update("src/routes/_authenticated.trips.$id.tsx", (source) => {
  if (source.includes("AI_CONTEXT_LAYER_V1_TRIP")) return source;
  source = replaceRequired(
    source,
    'import { AppHeader } from "@/components/AppHeader";',
    'import { AppHeader } from "@/components/AppHeader";\nimport { AIContextActions } from "@/components/AIContextActions";\n// AI_CONTEXT_LAYER_V1_TRIP',
    "trip AI import",
  );
  source = replaceRequired(
    source,
    `        </header>\n\n        {(entries ?? []).some((entry) => entry.lat != null && entry.lng != null) && (`,
    `        </header>\n\n        {!finalized && (\n          <section className="mt-4 overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.08] via-card to-cyan-500/[0.06] p-4 shadow-soft sm:p-5">\n            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">\n              <div>\n                <div className="flex items-center gap-2 text-sm font-bold text-violet-500">\n                  <Sparkles className="h-4 w-4" /> GlobeLink IA dans ce voyage\n                </div>\n                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">\n                  Demande un conseil rapide gratuitement, ou laisse IA+ lire ce carnet précis pour réorganiser tes journées, ton budget et tes étapes.\n                </p>\n              </div>\n              <AIContextActions\n                destination={[trip.city, trip.country].filter(Boolean).join(", ")}\n                freePrompt={\`Donne-moi des conseils généraux pour un voyage à \${[trip.city, trip.country].filter(Boolean).join(", ") || trip.title}, notamment pour organiser mes journées efficacement.\`}\n                proPrompt={\`Analyse le voyage \"\${trip.title}\" dans mon carnet GlobeLink et organise ou réorganise mes journées de façon réaliste, en réduisant les trajets et en respectant mon budget.\`}\n                proMode="plan"\n                tripId={id}\n                freeLabel="Conseil rapide"\n                proLabel="Organiser ce voyage avec IA+"\n                compact\n              />\n            </div>\n          </section>\n        )}\n\n        {(entries ?? []).some((entry) => entry.lat != null && entry.lng != null) && (`,
    "trip contextual AI",
  );
  return source;
});

console.log("[GlobeLink IA layer] IA gratuite + IA+ contextualisées dans les parcours voyage.");
