import fs from "node:fs";

const file = new URL("../src/routes/map.tsx", import.meta.url);
let source = fs.readFileSync(file, "utf8");
const marker = "// EXPLORER_ADD_TO_TRIP_MOBILE_FIX_V1";

if (source.includes(marker)) {
  console.log("[Explorer add-to-trip] correctif mobile déjà appliqué.");
  process.exit(0);
}
if (!source.includes("// EXPLORER_TRAVEL_MAP_V1")) {
  throw new Error("[Explorer add-to-trip] Explorer travel map doit être appliqué avant ce correctif.");
}

function replaceRequired(search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`[Explorer add-to-trip] Bloc introuvable: ${label}`);
  }
  source = source.replace(search, replacement);
}

replaceRequired(
  "// EXPLORER_TRAVEL_MAP_V1",
  `// EXPLORER_TRAVEL_MAP_V1\n${marker}`,
  "marqueur Explorer",
);

replaceRequired(
  '  const { data: trips = [] } = useQuery({\n    queryKey: ["explorer-trips", user?.id],\n    enabled: !!user && !!place,',
  '  const { data: trips = [], isLoading: tripsLoading, isError: tripsError, refetch: refetchTrips } = useQuery({\n    queryKey: ["explorer-trips", user?.id],\n    enabled: !!user && !!place && tripPickerOpen,',
  "chargement du sélecteur de voyage",
);

replaceRequired(
  `                onClick={() => {\n                  if (!user) {\n                    toast.info("Connecte-toi pour ajouter ce lieu à un voyage.");\n                    return;\n                  }\n                  setTripPickerOpen(true);\n                }}`,
  `                onClick={() => {\n                  if (!user) {\n                    toast.info("Connecte-toi pour ajouter ce lieu à un voyage.");\n                    const redirect = window.location.pathname + window.location.search;\n                    window.location.assign("/auth?redirect=" + encodeURIComponent(redirect));\n                    return;\n                  }\n                  setTripPickerOpen((open) => !open);\n                }}`,
  "clic principal ajouter au voyage",
);

replaceRequired(
  `              </Button>\n\n              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">`,
  `              </Button>\n\n              {tripPickerOpen && (\n                <div\n                  data-testid="explorer-trip-picker"\n                  className="mt-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-3 shadow-soft"\n                >\n                  <div className="mb-3 flex items-center justify-between gap-3">\n                    <div>\n                      <p className="text-sm font-bold">Ajouter à quel voyage ?</p>\n                      <p className="mt-0.5 text-xs text-muted-foreground">Choisis le carnet où enregistrer ce lieu.</p>\n                    </div>\n                    <button\n                      type="button"\n                      aria-label="Fermer le choix du voyage"\n                      onClick={() => setTripPickerOpen(false)}\n                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground"\n                    >\n                      <X className="h-4 w-4" />\n                    </button>\n                  </div>\n\n                  {tripsLoading ? (\n                    <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-muted-foreground">\n                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> Chargement de tes voyages…\n                    </div>\n                  ) : tripsError ? (\n                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center">\n                      <p className="text-xs text-muted-foreground">Impossible de charger tes voyages pour le moment.</p>\n                      <Button\n                        type="button"\n                        size="sm"\n                        variant="outline"\n                        className="mt-2 rounded-full"\n                        onClick={() => void refetchTrips()}\n                      >\n                        Réessayer\n                      </Button>\n                    </div>\n                  ) : trips.length ? (\n                    <div className="max-h-[34dvh] space-y-2 overflow-y-auto overscroll-contain pr-0.5">\n                      {trips.map((trip) => (\n                        <button\n                          key={trip.id}\n                          type="button"\n                          disabled={!!addingTripId}\n                          onClick={() => void addToTrip(trip)}\n                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left transition active:scale-[0.99] disabled:opacity-60"\n                        >\n                          <div className="min-w-0">\n                            <div className="truncate text-sm font-semibold">{trip.title}</div>\n                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">\n                              {[trip.city, trip.country].filter(Boolean).join(", ") || "Voyage GlobeLink"}\n                              {trip.starts_on\n                                ? " · dès le " + new Date(trip.starts_on + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })\n                                : ""}\n                            </div>\n                          </div>\n                          {addingTripId === trip.id ? (\n                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />\n                          ) : (\n                            <Plus className="h-4 w-4 shrink-0 text-primary" />\n                          )}\n                        </button>\n                      ))}\n                    </div>\n                  ) : (\n                    <div className="rounded-xl border border-dashed border-border bg-card/60 p-4 text-center">\n                      <p className="text-sm font-semibold">Tu n’as pas encore de voyage.</p>\n                      <p className="mt-1 text-xs text-muted-foreground">Crée ton premier carnet puis reviens ajouter ce lieu.</p>\n                      <Button asChild size="sm" className="mt-3 rounded-full">\n                        <Link to="/trips">Créer mon voyage</Link>\n                      </Button>\n                    </div>\n                  )}\n                </div>\n              )}\n\n              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">`,
  "sélecteur visible dans la fiche",
);

replaceRequired(
  '<Dialog open={tripPickerOpen} onOpenChange={(open) => !addingTripId && setTripPickerOpen(open)}>',
  '<Dialog open={false} onOpenChange={() => undefined}>',
  "désactivation de l’ancien modal imbriqué",
);

fs.writeFileSync(file, source, "utf8");
console.log("[Explorer add-to-trip] sélecteur inline mobile + redirection auth activés.");
