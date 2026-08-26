import fs from "node:fs";

const file = new URL("../src/routes/index.tsx", import.meta.url);
let source = fs.readFileSync(file, "utf8");

const marker = "// HOME_SIMPLIFIED_V1";
if (source.includes(marker)) {
  console.log("[GlobeLink] Home simplification already applied.");
  process.exit(0);
}

function replaceExact(search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`[home-v1] Block not found: ${label}`);
  }
  source = source.replace(search, replacement);
}

function replaceRegex(pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[home-v1] Pattern not found: ${label}`);
  }
  pattern.lastIndex = 0;
  source = source.replace(pattern, replacement);
}

replaceExact(
  `  const [locationDenied, setLocationDenied] = useState(false);`,
  `  const [locationDenied, setLocationDenied] = useState(false);\n  const [loadSecondaryContent, setLoadSecondaryContent] = useState(false);\n  const secondaryContentRef = useRef<HTMLDivElement | null>(null);\n  ${marker}`,
  "secondary-content state",
);

replaceRegex(
  /\n  const \{ data: photos = \[\] \} = useQuery\(\{[\s\S]*?\n  const \{ data: internetDiscoveries/,
  `\n  const { data: internetDiscoveries`,
  "remove photos and members queries",
);

replaceExact(
  `  const { data: internetDiscoveries = [], isLoading: discoveriesLoading } = useQuery({\n    queryKey: ["live-catalog", "homepage-popular"],\n    queryFn: () => fetchLiveCatalog({ kinds: ["activity", "restaurant", "hotel"], limit: 72 }),`,
  `  const { data: internetDiscoveries = [], isLoading: discoveriesLoading } = useQuery({\n    queryKey: ["live-catalog", "homepage-popular"],\n    enabled: loadSecondaryContent,\n    queryFn: () => fetchLiveCatalog({ kinds: ["activity"], limit: 24 }),`,
  "lazy discovery query",
);

replaceExact(
  `  const { data: internetDeals = [], isLoading: dealsLoading } = useQuery({\n    queryKey: ["live-catalog", "homepage-deals"],`,
  `  const { data: internetDeals = [], isLoading: dealsLoading } = useQuery({\n    queryKey: ["live-catalog", "homepage-deals"],\n    enabled: loadSecondaryContent,`,
  "lazy deals query",
);

replaceExact(
  `  const { data: internetDiscoveries = [], isLoading: discoveriesLoading } = useQuery({`,
  `  useEffect(() => {\n    if (loadSecondaryContent || !secondaryContentRef.current) return;\n    const node = secondaryContentRef.current;\n    const observer = new IntersectionObserver(\n      ([entry]) => {\n        if (!entry.isIntersecting) return;\n        setLoadSecondaryContent(true);\n        observer.disconnect();\n      },\n      { rootMargin: "700px" },\n    );\n    observer.observe(node);\n    return () => observer.disconnect();\n  }, [loadSecondaryContent]);\n\n  const { data: internetDiscoveries = [], isLoading: discoveriesLoading } = useQuery({`,
  "secondary-content observer",
);

replaceRegex(
  /\n        <section className="mx-auto max-w-6xl px-3 pt-3 sm:px-4">\n          <div className="surface-card p-3 sm:p-4">[\s\S]*?\n        <\/section>\n\n        \{user && \(/,
  `\n\n        {user && (`,
  "remove duplicated home search and shortcut panel",
);

replaceExact(
  `Ton GlobeLink personnalisé`,
  `Ton espace Voyage`,
  "travel card label",
);

replaceExact(
  `                <div className="flex flex-wrap gap-2">\n                  {nextTravelIntent ? (\n                    <Link\n                      to="/destinations/$slug"\n                      params={{ slug: slugifyDestination(nextTravelIntent.destination_country) }}\n                      className="inline-flex h-10 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-semibold"\n                    >\n                      Voir la destination <ChevronRight className="h-4 w-4" />\n                    </Link>\n                  ) : (\n                    <Link\n                      to="/trips"\n                      className="inline-flex h-10 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-semibold"\n                    >\n                      Ajouter un voyage <ChevronRight className="h-4 w-4" />\n                    </Link>\n                  )}\n                  <Link\n                    to="/destinations"\n                    className="inline-flex h-10 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-semibold"\n                  >\n                    Destinations <MapPin className="h-4 w-4" />\n                  </Link>\n                  <Link\n                    to="/match"\n                    className="inline-flex h-10 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"\n                  >\n                    Travel Match <Users className="h-4 w-4" />\n                  </Link>\n                </div>`,
  `                <div className="flex flex-wrap gap-2">\n                  <Link\n                    to="/trips"\n                    className="inline-flex h-10 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"\n                  >\n                    {nextTravelIntent ? "Ouvrir Voyage" : "Créer mon voyage"}\n                    <ChevronRight className="h-4 w-4" />\n                  </Link>\n                  {nextTravelIntent ? (\n                    <Link\n                      to="/destinations/$slug"\n                      params={{ slug: slugifyDestination(nextTravelIntent.destination_country) }}\n                      className="inline-flex h-10 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-semibold"\n                    >\n                      Explorer la destination <MapPin className="h-4 w-4" />\n                    </Link>\n                  ) : (\n                    <Link\n                      to="/intelligence"\n                      className="inline-flex h-10 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-semibold"\n                    >\n                      Préparer avec l’IA <Sparkles className="h-4 w-4" />\n                    </Link>\n                  )}\n                </div>`,
  "simplify trip card actions",
);

replaceExact(
  `        <section className="catalog-after-feed border-y border-border/60 bg-card/25 py-8 sm:py-12">`,
  `        <div ref={secondaryContentRef} className="h-px" aria-hidden="true" />\n        {loadSecondaryContent && (\n          <section className="catalog-after-feed border-y border-border/60 bg-card/25 py-8 sm:py-12">`,
  "lazy catalog opening",
);

replaceRegex(
  /\n            <CatalogSection\n              title="Restaurants populaires"[\s\S]*?\n            \/>/,
  "",
  "remove restaurant section from home",
);

replaceRegex(
  /\n            <CatalogSection\n              title="Hôtels populaires"[\s\S]*?\n            \/>/,
  "",
  "remove hotel section from home",
);

replaceRegex(
  /\n        \{photos\.length > 0 && \([\s\S]*?\n      <\/main>/,
  `\n        )}\n      </main>`,
  "remove secondary social galleries and close lazy catalog",
);

fs.writeFileSync(file, source);
console.log("[GlobeLink] Home simplified: stories → Voyage → feed, with lazy secondary discovery.");
