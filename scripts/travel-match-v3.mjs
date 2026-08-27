import fs from "node:fs";

function update(path, transform) {
  const file = new URL(`../${path}`, import.meta.url);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`[Travel Match V3] ${path}: mis à jour`);
  } else {
    console.log(`[Travel Match V3] ${path}: déjà conforme`);
  }
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`[travel-match-v3] Bloc introuvable: ${label}`);
  return source.replace(search, replacement);
}

update("src/routes/_authenticated.match.tsx", (source) => {
  if (source.includes("TRAVEL_MATCH_V3")) return source;

  source = replaceRequired(
    source,
    "  ShieldCheck,\n} from \"lucide-react\";",
    "  ShieldCheck,\n  Coffee,\n  Footprints,\n  UsersRound,\n} from \"lucide-react\";\n// TRAVEL_MATCH_V3",
    "match icons",
  );

  source = replaceRequired(
    source,
    "type Candidate = { key: string; t: MapTraveler; profileId: string; verified: boolean };",
    `type MatchIntent = {\n  id: \"activity\" | \"coffee\" | \"explore\";\n  label: string;\n  helper: string;\n  draft: string;\n};\n\nfunction matchQuality(score: number) {\n  if (score >= 80) return \"Excellent match\";\n  if (score >= 65) return \"Très compatible\";\n  if (score >= 50) return \"Bon potentiel\";\n  return \"À découvrir\";\n}\n\nfunction suggestedMeetups(t: MapTraveler, sharedInts: string[]): MatchIntent[] {\n  const place = [t.city, t.country].filter(Boolean).join(\", \") || \"votre destination\";\n  const shared = sharedInts[0];\n  return [\n    {\n      id: \"activity\",\n      label: \"Faire une activité ensemble\",\n      helper: shared ? \`Vous aimez tous les deux : \${shared}\` : \"Choisir une activité sur place\",\n      draft: shared\n        ? \`Salut \${t.name} 👋 On a \${shared} en commun. Ça te dirait de faire une activité ensemble autour de ça à \${place} ?\`\n        : \`Salut \${t.name} 👋 Ça te dirait qu’on fasse une activité ensemble à \${place} pendant nos dates en commun ?\`,\n    },\n    {\n      id: \"coffee\",\n      label: \"Prendre un café\",\n      helper: \"Un premier contact simple\",\n      draft: \`Salut \${t.name} 👋 On sera à \${place} au même moment. Ça te dirait de prendre un café et d’échanger sur nos plans ?\`,\n    },\n    {\n      id: \"explore\",\n      label: \"Explorer ensemble\",\n      helper: \"Partager une demi-journée ou une journée\",\n      draft: \`Salut \${t.name} 👋 Nos voyages se croisent à \${place}. Ça te dirait d’explorer un coin ensemble pendant une demi-journée ou une journée ?\`,\n    },\n  ];\n}\n\ntype Candidate = { key: string; t: MapTraveler; profileId: string; verified: boolean };`,
    "intent helpers",
  );

  source = replaceRequired(
    source,
    '  async function advance(direction: "left" | "right") {',
    '  async function advance(direction: "left" | "right", intent?: MatchIntent) {',
    "advance signature",
  );

  source = replaceRequired(
    source,
    `      const targetId = candidate.profileId;\n\n      if (direction === \"left\") {`,
    `      const targetId = candidate.profileId;\n\n      if (direction === \"left\") {`,
    "target anchor",
  );

  source = replaceRequired(
    source,
    `      const result = await sendLike({ data: { toUserId: targetId } });\n      qc.invalidateQueries({ queryKey: [\"match-exclusions\", user.id] });`,
    `      if (intent && typeof window !== \"undefined\") {\n        window.localStorage.setItem(\`globelink:match-intent:\${targetId}\`, intent.draft);\n      }\n\n      const result = await sendLike({ data: { toUserId: targetId } });\n      qc.invalidateQueries({ queryKey: [\"match-exclusions\", user.id] });`,
    "store intent",
  );

  source = replaceRequired(
    source,
    `        toast.success(\`Match avec \${candidate.t.name} ✨\`, {\n          description: \"La conversation est ouverte dans Messages.\",\n          action: {\n            label: \"Message\",\n            onClick: () =>\n              navigate({ to: \"/messages/$id\", params: { id: result.conversationId! } }),\n          },\n        });`,
    `        toast.success(\`Match avec \${candidate.t.name} ✨\`, {\n          description: intent\n            ? \`Votre match est mutuel. Le message « \${intent.label} » est prêt.\`\n            : \"La conversation est ouverte dans Messages.\",\n          action: {\n            label: intent ? \"Préparer l’invitation\" : \"Message\",\n            onClick: () =>\n              navigate({\n                to: \"/messages/$id\",\n                params: { id: result.conversationId! },\n                search: intent ? { draft: intent.draft } : {},\n              }),\n          },\n        });`,
    "matched intent toast",
  );

  source = replaceRequired(
    source,
    `        toast(\`Like envoyé à \${candidate.t.name}\`, {\n          description: \"Tu verras un match s'il te like en retour.\",\n        });`,
    `        toast(\`Like envoyé à \${candidate.t.name}\`, {\n          description: intent\n            ? \`Si le match devient mutuel, GlobeLink gardera ton idée : « \${intent.label} ».\`\n            : \"Tu verras un match s'il te like en retour.\",\n        });`,
    "pending intent toast",
  );

  source = source.replace('            <div className="relative mx-auto h-[585px] w-full max-w-sm select-none">', '            <div className="relative mx-auto h-[660px] w-full max-w-sm select-none">');

  source = replaceRequired(
    source,
    `                      sharedInts={next.s.sharedInts}\n                      overlap={next.s.overlap}`,
    `                      sharedInts={next.s.sharedInts}\n                      sharedLangs={next.s.sharedLangs}\n                      overlap={next.s.overlap}`,
    "next shared langs",
  );
  source = replaceRequired(
    source,
    `                      sharedInts={current.s.sharedInts}\n                      overlap={current.s.overlap}`,
    `                      sharedInts={current.s.sharedInts}\n                      sharedLangs={current.s.sharedLangs}\n                      overlap={current.s.overlap}`,
    "current shared langs",
  );

  source = replaceRequired(
    source,
    `            {current && (\n              <div className="mt-4 flex items-center justify-center gap-4">`,
    `            {current && (\n              <section className="surface-card mt-4 rounded-[1.6rem] p-4">\n                <div className="flex items-center justify-between gap-3">\n                  <div>\n                    <p className="text-sm font-semibold">Une idée pour briser la glace</p>\n                    <p className="mt-0.5 text-xs text-muted-foreground">\n                      Choisis une intention : elle envoie un like et prépare le message si le match devient mutuel.\n                    </p>\n                  </div>\n                  <UsersRound className="h-5 w-5 shrink-0 text-primary" />\n                </div>\n                <div className="mt-3 grid gap-2 sm:grid-cols-3">\n                  {suggestedMeetups(current.c.t, current.s.sharedInts).map((intent) => {\n                    const Icon = intent.id === \"coffee\" ? Coffee : intent.id === \"explore\" ? Footprints : Sparkles;\n                    return (\n                      <button\n                        key={intent.id}\n                        type="button"\n                        disabled={busy}\n                        onClick={() => advance(\"right\", intent)}\n                        className="rounded-2xl border border-border bg-background/70 p-3 text-left transition hover:border-primary/30 hover:bg-primary/[0.04] disabled:opacity-60"\n                      >\n                        <Icon className="h-4 w-4 text-primary" />\n                        <span className="mt-2 block text-xs font-semibold leading-snug">{intent.label}</span>\n                        <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">{intent.helper}</span>\n                      </button>\n                    );\n                  })}\n                </div>\n              </section>\n            )}\n\n            {current && (\n              <div className="mt-4 flex items-center justify-center gap-4">`,
    "meetup actions",
  );

  source = replaceRequired(
    source,
    `  sharedInts,\n  overlap,`,
    `  sharedInts,\n  sharedLangs,\n  overlap,`,
    "swipe signature destructure",
  );
  source = replaceRequired(
    source,
    `  sharedInts: string[];\n  overlap: number;`,
    `  sharedInts: string[];\n  sharedLangs: string[];\n  overlap: number;`,
    "swipe props type",
  );
  source = replaceRequired(
    source,
    `}) {\n  return (\n    <div`,
    `}) {\n  const strongParts = parts.filter((part) => part.max > 0 && part.got / part.max >= 0.6);\n  const cautionParts = parts.filter((part) => [\"Destination\", \"Dates\", \"Budget\"].includes(part.label) && part.got === 0);\n  const signals = [\n    overlap > 0 ? \`\${overlap} jour\${overlap > 1 ? \"s\" : \"\"} de voyage en commun\` : null,\n    sharedInts.length ? \`\${sharedInts.length} centre\${sharedInts.length > 1 ? \"s\" : \"\"} d’intérêt commun\${sharedInts.length > 1 ? \"s\" : \"\"}\` : null,\n    sharedLangs.length ? \`\${sharedLangs.length} langue\${sharedLangs.length > 1 ? \"s\" : \"\"} commune\${sharedLangs.length > 1 ? \"s\" : \"\"}\` : null,\n  ].filter(Boolean) as string[];\n\n  return (\n    <div`,
    "swipe compatibility helpers",
  );

  source = source.replace('<div className="relative h-80 w-full">', '<div className="relative h-72 w-full">');

  source = replaceRequired(
    source,
    `        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">\n          <div className="flex items-center gap-2 text-xs font-semibold text-primary">\n            <CheckCircle2 className="h-4 w-4" /> Pourquoi {score}% ?\n          </div>\n          <p className="mt-1 text-xs text-muted-foreground">\n            {overlap > 0\n              ? \`\${overlap} jour\${overlap > 1 ? \"s\" : \"\"} de voyage en commun\`\n              : \"Dates différentes\"}\n            {sharedInts.length\n              ? \` · \${sharedInts.slice(0, 3).join(\" · \")}\`\n              : \" · complète tes centres d'intérêt pour affiner\"}\n          </p>\n        </div>\n        <div className="flex flex-wrap gap-1 pt-1">\n          {parts.map((part) => (\n            <span\n              key={part.label}\n              className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground"\n            >\n              {part.label} {part.got}/{part.max}\n            </span>\n          ))}\n        </div>`,
    `        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">\n          <div className="flex items-center justify-between gap-3">\n            <div className="flex items-center gap-2 text-xs font-semibold text-primary">\n              <CheckCircle2 className="h-4 w-4" /> Pourquoi ce match ?\n            </div>\n            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">\n              {matchQuality(score)}\n            </span>\n          </div>\n          <div className="mt-2 flex flex-wrap gap-1.5">\n            {signals.length ? signals.map((signal) => (\n              <span key={signal} className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium text-foreground">\n                {signal}\n              </span>\n            )) : (\n              <span className="text-[11px] text-muted-foreground">Complète tes préférences pour obtenir une explication plus précise.</span>\n            )}\n          </div>\n          {sharedInts.length > 0 && (\n            <p className="mt-2 text-[11px] text-muted-foreground">\n              Affinités fortes : <span className="font-semibold text-foreground">{sharedInts.slice(0, 4).join(\" · \")}</span>\n            </p>\n          )}\n          {sharedLangs.length > 0 && (\n            <p className="mt-1 text-[11px] text-muted-foreground">\n              Langues communes : <span className="font-semibold text-foreground">{sharedLangs.slice(0, 3).join(\" · \")}</span>\n            </p>\n          )}\n          {cautionParts.length > 0 && (\n            <p className="mt-2 text-[10px] text-muted-foreground">\n              À vérifier : {cautionParts.map((part) => part.label.toLowerCase()).join(\", \")}.\n            </p>\n          )}\n        </div>\n        <div className="grid grid-cols-3 gap-1.5 pt-1">\n          {parts.slice(0, 6).map((part) => {\n            const pct = part.max ? Math.round((part.got / part.max) * 100) : 0;\n            return (\n              <div key={part.label} className="rounded-xl bg-secondary/55 p-2">\n                <div className="flex items-center justify-between gap-1 text-[9px] text-muted-foreground">\n                  <span>{part.label}</span><span>{pct}%</span>\n                </div>\n                <div className="mt-1 h-1 overflow-hidden rounded-full bg-background">\n                  <div className="h-full rounded-full bg-primary" style={{ width: \`\${pct}%\` }} />\n                </div>\n              </div>\n            );\n          })}\n        </div>`,
    "compatibility explanation",
  );

  return source;
});

update("src/routes/_authenticated.messages.$id.tsx", (source) => {
  if (source.includes("TRAVEL_MATCH_V3_DRAFT")) return source;

  source = replaceRequired(
    source,
    'import { formatDistanceToNow } from "date-fns";',
    'import { formatDistanceToNow } from "date-fns";\nimport { z } from "zod";',
    "message zod import",
  );

  source = replaceRequired(
    source,
    'export const Route = createFileRoute("/_authenticated/messages/$id")({',
    'const messageSearch = z.object({ draft: z.string().max(360).optional() });\n// TRAVEL_MATCH_V3_DRAFT\n\nexport const Route = createFileRoute("/_authenticated/messages/$id")({',
    "message search schema",
  );

  source = replaceRequired(
    source,
    '  component: ConversationPage,\n});',
    '  validateSearch: (search) => messageSearch.parse(search),\n  component: ConversationPage,\n});',
    "message validate search",
  );

  source = replaceRequired(
    source,
    'function ConversationPage() {\n  const { id } = Route.useParams();',
    'function ConversationPage() {\n  const { id } = Route.useParams();\n  const { draft } = Route.useSearch();',
    "message search read",
  );

  source = replaceRequired(
    source,
    '  const [text, setText] = useState("");',
    '  const [text, setText] = useState(draft?.trim() ?? "");',
    "message initial draft",
  );

  source = replaceRequired(
    source,
    `  const { data: conversationControlled = false } = useQuery({`,
    `  useEffect(() => {\n    if (!other?.user_id || typeof window === \"undefined\") return;\n    const key = \`globelink:match-intent:\${other.user_id}\`;\n    const pending = window.localStorage.getItem(key);\n    if (draft?.trim()) {\n      window.localStorage.removeItem(key);\n      return;\n    }\n    if (!pending) return;\n    setText((current) => current.trim() ? current : pending);\n    window.localStorage.removeItem(key);\n  }, [other?.user_id, draft]);\n\n  const { data: conversationControlled = false } = useQuery({`,
    "restore pending intent",
  );

  return source;
});

console.log("[Travel Match V3] Compatibilité expliquée + intentions de rencontre + brouillon de message activés.");
