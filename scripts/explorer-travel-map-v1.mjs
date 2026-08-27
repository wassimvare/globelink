import fs from "node:fs";

const file = new URL("../src/routes/map.tsx", import.meta.url);
let source = fs.readFileSync(file, "utf8");

const marker = "// EXPLORER_TRAVEL_MAP_V1";
if (source.includes(marker)) {
  console.log("[GlobeLink] Explorer travel map already applied.");
  process.exit(0);
}

function replaceExact(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`[explorer-v1] Block not found: ${label}`);
  source = source.replace(search, replacement);
}

replaceExact(
  `import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";`,
  `import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";\nimport { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";`,
  "dialog import",
);

replaceExact(
  `  booking_url?: string | null;\n  created_at?: string;`,
  `  booking_url?: string | null;\n  price_text?: string | null;\n  created_at?: string;`,
  "place price field",
);

replaceExact(
  `  component: MapPage,\n});`,
  `  component: MapPage,\n});\n\n${marker}`,
  "marker",
);

replaceExact(
  `function escapeHtml(value: string) {`,
  `function distanceBetweenKm(aLat: number, aLng: number, bLat: number, bLng: number) {\n  const radius = 6371;\n  const dLat = ((bLat - aLat) * Math.PI) / 180;\n  const dLng = ((bLng - aLng) * Math.PI) / 180;\n  const lat1 = (aLat * Math.PI) / 180;\n  const lat2 = (bLat * Math.PI) / 180;\n  const value =\n    Math.sin(dLat / 2) ** 2 +\n    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;\n  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));\n}\n\nfunction escapeHtml(value: string) {`,
  "distance helper",
);

replaceExact(
  `      booking_url: null,\n      created_at: p.created_at,`,
  `      booking_url: null,\n      price_text: null,\n      created_at: p.created_at,`,
  "community price",
);

replaceExact(
  `          booking_url: item.booking_url,\n          created_at: item.fetched_at,`,
  `          booking_url: item.booking_url,\n          price_text: item.price_text,\n          created_at: item.fetched_at,`,
  "external price",
);

replaceExact(
  `  const displayedOfferCount = useMemo(\n    () =>\n      displayedPlaces.filter((place) => (place.filter_categories ?? []).includes("deal")).length,\n    [displayedPlaces],\n  );`,
  `  const displayedOfferCount = useMemo(\n    () =>\n      displayedPlaces.filter((place) => (place.filter_categories ?? []).includes("deal")).length,\n    [displayedPlaces],\n  );\n\n  const explorerOrigin = useMemo(() => {\n    if (userPosition) return { lat: userPosition[0], lng: userPosition[1], label: "autour de toi" };\n    if (!viewport) return null;\n    return {\n      lat: (viewport.south + viewport.north) / 2,\n      lng: (viewport.west + viewport.east) / 2,\n      label: countryQuery.trim() ? `près de ${countryQuery.trim()}` : "dans cette zone",\n    };\n  }, [countryQuery, userPosition, viewport]);\n\n  const explorerResults = useMemo(() => {\n    return displayedPlaces\n      .map((place) => ({\n        place,\n        distanceKm: explorerOrigin\n          ? distanceBetweenKm(explorerOrigin.lat, explorerOrigin.lng, place.lat, place.lng)\n          : null,\n      }))\n      .sort((a, b) => {\n        if (a.distanceKm != null && b.distanceKm != null && Math.abs(a.distanceKm - b.distanceKm) > 0.15)\n          return a.distanceKm - b.distanceKm;\n        if (a.place.rating !== b.place.rating) return b.place.rating - a.place.rating;\n        return b.place.reviews_count - a.place.reviews_count;\n      })\n      .slice(0, 24);\n  }, [displayedPlaces, explorerOrigin]);`,
  "explorer results",
);

replaceExact(
  `        <div className="map-canvas-shell surface-card relative mx-auto mt-2 h-[68dvh] min-h-[520px] max-w-[1600px] overflow-hidden rounded-[1.6rem] p-1 shadow-soft sm:h-[calc(100dvh-13.5rem)] sm:min-h-[600px] sm:rounded-[2rem] sm:p-1.5">`,
  `        <div className="mt-2 grid gap-2 lg:grid-cols-[360px_minmax(0,1fr)]">\n          <aside className="surface-card hidden h-[calc(100dvh-13.5rem)] min-h-[600px] overflow-hidden rounded-[1.6rem] lg:flex lg:flex-col">\n            <div className="border-b border-border/70 p-4">\n              <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Explorer</div>\n              <div className="mt-1 flex items-end justify-between gap-3">\n                <div>\n                  <h2 className="font-display text-xl font-bold">À découvrir {explorerOrigin?.label ?? "ici"}</h2>\n                  <p className="mt-1 text-xs text-muted-foreground">Photos, notes, distance et sources fiables dans la zone de la carte.</p>\n                </div>\n                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{explorerResults.length}</span>\n              </div>\n            </div>\n            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">\n              {explorerResults.length ? (\n                explorerResults.map((entry) => (\n                  <ExplorerPlaceCard\n                    key={entry.place.id}\n                    entry={entry}\n                    onSelect={(place) => setSelected(place)}\n                    onPrefetch={(place) => void prefetchPlaceMedia(place, true)}\n                  />\n                ))\n              ) : (\n                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">\n                  Déplace la carte ou recherche une destination pour voir les meilleures adresses de la zone.\n                </div>\n              )}\n            </div>\n          </aside>\n\n          <div className="map-canvas-shell surface-card relative h-[68dvh] min-h-[520px] min-w-0 overflow-hidden rounded-[1.6rem] p-1 shadow-soft sm:h-[calc(100dvh-13.5rem)] sm:min-h-[600px] sm:rounded-[2rem] sm:p-1.5">`,
  "desktop results layout",
);

replaceExact(
  `        </div>\n\n        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground sm:text-xs">`,
  `          </div>\n        </div>\n\n        {explorerResults.length > 0 && (\n          <section className="mt-2 lg:hidden">\n            <div className="mb-2 flex items-center justify-between px-1">\n              <div>\n                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Explorer</div>\n                <h2 className="font-display text-lg font-bold">À découvrir {explorerOrigin?.label ?? "ici"}</h2>\n              </div>\n              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{explorerResults.length}</span>\n            </div>\n            <div className="flex snap-x gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">\n              {explorerResults.slice(0, 12).map((entry) => (\n                <ExplorerPlaceCard\n                  key={entry.place.id}\n                  entry={entry}\n                  mobile\n                  onSelect={(place) => setSelected(place)}\n                  onPrefetch={(place) => void prefetchPlaceMedia(place, true)}\n                />\n              ))}\n            </div>\n          </section>\n        )}\n\n        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground sm:text-xs">`,
  "mobile results carousel",
);

replaceExact(
  `function catalogTagText(place: AnyPlace | null, key: string) {`,
  `function ExplorerPlaceCard({\n  entry,\n  onSelect,\n  onPrefetch,\n  mobile = false,\n}: {\n  entry: { place: AnyPlace; distanceKm: number | null };\n  onSelect: (place: AnyPlace) => void;\n  onPrefetch: (place: AnyPlace) => void;\n  mobile?: boolean;\n}) {\n  const { place, distanceKm } = entry;\n  const cat = mapCategoryMeta(place.marker_category || place.category);\n  const price = place.price_text || (place.budget ? BUDGET_LABELS[place.budget - 1] : null);\n  const openState = placeOpenState(place);\n  return (\n    <button\n      type="button"\n      onClick={() => onSelect(place)}\n      onPointerEnter={() => onPrefetch(place)}\n      onTouchStart={() => onPrefetch(place)}\n      className={[\n        "group overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-sm transition hover:border-primary/30 hover:shadow-soft",\n        mobile ? "w-[84vw] max-w-[340px] shrink-0 snap-start" : "w-full",\n      ].join(" ")}\n    >\n      <div className="grid grid-cols-[108px_minmax(0,1fr)]">\n        <CatalogImage\n          item={placeMediaItem(place)}\n          lookup={placeMediaLookup(place)}\n          className="h-full min-h-[118px] w-full object-cover transition duration-500 group-hover:scale-[1.03]"\n          placeholderClassName="h-full min-h-[118px] w-full"\n        />\n        <div className="min-w-0 p-3">\n          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">\n            <span>{cat?.emoji ?? "📍"}</span>\n            <span className="truncate">{cat?.label ?? "Lieu"}</span>\n            {isOfferPlace(place) && <span className="text-orange-500">· Offre</span>}\n          </div>\n          <h3 className="mt-1 line-clamp-2 font-display text-[15px] font-bold leading-tight">{place.name}</h3>\n          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">\n            {place.rating > 0 && (\n              <span className="inline-flex items-center gap-0.5 font-semibold">\n                {place.rating.toFixed(1)} <Star className="h-3 w-3 fill-amber-400 text-amber-400" />\n              </span>\n            )}\n            {distanceKm != null && Number.isFinite(distanceKm) && (\n              <span className="text-muted-foreground">· {distanceKm < 1 ? `${Math.max(50, Math.round(distanceKm * 1000 / 50) * 50)} m` : `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`}</span>\n            )}\n            {price && <span className="font-semibold text-foreground">· {price}</span>}\n          </div>\n          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{[place.city, place.country].filter(Boolean).join(", ") || "Position sur la carte"}</p>\n          <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">\n            <span className={openState === "Ouvert" ? "font-semibold text-emerald-600 dark:text-emerald-400" : openState === "Fermé" ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground"}>\n              {openState || (place.hours && !/à vérifier|non renseignés/i.test(place.hours) ? place.hours.slice(0, 34) : "Horaires sur la source")}\n            </span>\n            <span className="max-w-[45%] truncate font-medium text-primary">{place.provider || "GlobeLink"}</span>\n          </div>\n        </div>\n      </div>\n    </button>\n  );\n}\n\nfunction catalogTagText(place: AnyPlace | null, key: string) {`,
  "result card",
);

replaceExact(
  `function placeWebsite(place: AnyPlace | null) {`,
  `function placeOpenState(place: AnyPlace | null) {\n  const raw = place?.catalog_tags?.open_now ?? place?.catalog_tags?.is_open;\n  if (raw === true || raw === "true" || raw === "open") return "Ouvert";\n  if (raw === false || raw === "false" || raw === "closed") return "Fermé";\n  return null;\n}\n\nfunction placeWebsite(place: AnyPlace | null) {`,
  "open status helper",
);

replaceExact(
  `}) {\n  const [saved, setSaved] = useState(false);\n  useEffect(() => setSaved(false), [place?.id]);`,
  `}) {\n  const { user } = useAuth();\n  const qc = useQueryClient();\n  const [saved, setSaved] = useState(false);\n  const [tripPickerOpen, setTripPickerOpen] = useState(false);\n  const [addingTripId, setAddingTripId] = useState<string | null>(null);\n  useEffect(() => {\n    setSaved(false);\n    setTripPickerOpen(false);\n  }, [place?.id]);\n\n  const { data: trips = [] } = useQuery({\n    queryKey: ["explorer-trips", user?.id],\n    enabled: !!user && !!place,\n    staleTime: 60_000,\n    queryFn: async () => {\n      const { data, error } = await supabase\n        .from("trips")\n        .select("id,title,city,country,starts_on,ends_on,status")\n        .eq("user_id", user!.id)\n        .order("created_at", { ascending: false })\n        .limit(12);\n      if (error) throw error;\n      return data ?? [];\n    },\n  });\n\n  const addToTrip = async (trip: (typeof trips)[number]) => {\n    if (!place || !user || addingTripId) return;\n    setAddingTripId(trip.id);\n    try {\n      const { data: existing } = await supabase\n        .from("trip_entries")\n        .select("id")\n        .eq("trip_id", trip.id)\n        .eq("title", place.name)\n        .limit(1)\n        .maybeSingle();\n      if (existing) {\n        setSaved(true);\n        setTripPickerOpen(false);\n        toast.message("Ce lieu est déjà dans ce voyage");\n        return;\n      }\n      const visitDate = trip.starts_on || new Date().toISOString().slice(0, 10);\n      const kind = place.category === "hotel" ? "hotel" : place.category === "restaurant" ? "restaurant" : "activity";\n      const sourceNote = [\n        `Ajouté depuis Explorer · ${place.provider || "GlobeLink"}`,\n        place.source_url ? `Source : ${place.source_url}` : null,\n      ].filter(Boolean).join("\\n");\n      const { error } = await supabase.from("trip_entries").insert({\n        trip_id: trip.id,\n        user_id: user.id,\n        kind,\n        title: place.name,\n        city: place.city || null,\n        country: place.country || null,\n        notes: sourceNote,\n        lat: place.lat,\n        lng: place.lng,\n        price_level: place.budget,\n        rating: place.rating || null,\n        visited_on: visitDate,\n        position: Math.floor(Date.now() % 2_000_000_000),\n      });\n      if (error) throw error;\n      await qc.invalidateQueries({ queryKey: ["trip-entries", trip.id] });\n      await qc.invalidateQueries({ queryKey: ["trips", user.id] });\n      setSaved(true);\n      setTripPickerOpen(false);\n      toast.success(`Ajouté à ${trip.title}`);\n    } catch (error: any) {\n      toast.error(error?.message ?? "Impossible d’ajouter ce lieu au voyage.");\n    } finally {\n      setAddingTripId(null);\n    }\n  };`,
  "trip picker state",
);

replaceExact(
  `              <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">`,
  `              <Button\n                className="mt-5 h-12 w-full rounded-2xl text-sm font-bold shadow-soft"\n                onClick={() => {\n                  if (!user) {\n                    toast.info("Connecte-toi pour ajouter ce lieu à un voyage.");\n                    return;\n                  }\n                  setTripPickerOpen(true);\n                }}\n              >\n                <Plus className="mr-2 h-4 w-4" />\n                {saved ? "Ajouté à mon voyage" : "Ajouter à mon voyage"}\n              </Button>\n\n              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">`,
  "add to trip primary action",
);

replaceExact(
  `      </SheetContent>\n    </Sheet>\n  );\n}\n\nfunction TravelerSheet`,
  `      </SheetContent>\n\n      <Dialog open={tripPickerOpen} onOpenChange={(open) => !addingTripId && setTripPickerOpen(open)}>\n        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-3xl sm:w-full">\n          <DialogHeader>\n            <DialogTitle>Ajouter à quel voyage ?</DialogTitle>\n          </DialogHeader>\n          {trips.length ? (\n            <div className="max-h-[55dvh] space-y-2 overflow-y-auto">\n              {trips.map((trip) => (\n                <button\n                  key={trip.id}\n                  type="button"\n                  disabled={!!addingTripId}\n                  onClick={() => void addToTrip(trip)}\n                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40 disabled:opacity-60"\n                >\n                  <div className="min-w-0">\n                    <div className="truncate font-semibold">{trip.title}</div>\n                    <div className="mt-0.5 truncate text-xs text-muted-foreground">\n                      {[trip.city, trip.country].filter(Boolean).join(", ") || "Voyage GlobeLink"}\n                      {trip.starts_on ? ` · dès le ${new Date(`${trip.starts_on}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}\n                    </div>\n                  </div>\n                  {addingTripId === trip.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /> : <Plus className="h-4 w-4 shrink-0 text-primary" />}\n                </button>\n              ))}\n            </div>\n          ) : (\n            <div className="rounded-2xl border border-dashed border-border p-6 text-center">\n              <p className="text-sm text-muted-foreground">Crée d’abord un voyage pour y enregistrer ce lieu.</p>\n              <Button asChild className="mt-4 rounded-full">\n                <Link to="/trips">Créer mon voyage</Link>\n              </Button>\n            </div>\n          )}\n        </DialogContent>\n      </Dialog>\n    </Sheet>\n  );\n}\n\nfunction TravelerSheet`,
  "trip picker dialog",
);

fs.writeFileSync(file, source);
console.log("[GlobeLink] Explorer upgraded: map + nearby results + add-to-trip.");
