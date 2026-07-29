import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { PLACE_CATEGORIES } from "@/lib/countries";
import { MOCK_PLACES, type MockPlace } from "@/lib/mock-places";
import { fetchLocatedTravelers, type LocatedTraveler } from "@/lib/real-travelers";
import { COUNTRY_INFO } from "@/lib/country-info";
import { CountrySheet } from "@/components/CountrySheet";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bookmark, Share2, Star, Clock, MapPin, Globe2, Users, Sparkles, Filter, X, LocateFixed, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Carte du monde — GlobeLink" },
      { name: "description", content: "Voyageurs, restos, hôtels, plages, cascades, spots photo, activités et événements sur une carte mondiale filtrée par budget, pays, popularité." },
    ],
  }),
  component: MapPage,
});

type AnyPlace = MockPlace & { isCommunity?: boolean; created_at?: string };
type SortKey = "popular" | "recent";

const BUDGET_LABELS = ["€", "€€", "€€€", "€€€€"];

function MapPage() {
  const { data: dbPlaces } = useQuery({
    queryKey: ["places"],
    queryFn: async () => {
      const { data, error } = await supabase.from("places").select("*").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // An empty set means “all categories”. This keeps the initial mobile UI
  // clean instead of rendering every category as selected.
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [budgets, setBudgets] = useState<Set<1 | 2 | 3 | 4>>(new Set([1, 2, 3, 4]));
  const [countryQuery, setCountryQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [showTravelers, setShowTravelers] = useState(true);
  const [selected, setSelected] = useState<AnyPlace | null>(null);
  const [selectedTraveler, setSelectedTraveler] = useState<LocatedTraveler | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const allPlaces: AnyPlace[] = useMemo(() => {
    const community: AnyPlace[] = (dbPlaces ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category as MockPlace["category"],
      country: p.country,
      city: p.city ?? "",
      lat: p.lat,
      lng: p.lng,
      description: p.description ?? "",
      image_url: p.image_url ?? "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80",
      photos: [],
      budget: 2,
      rating: 4.5,
      reviews_count: 0,
      hours: "Horaires non renseignés",
      comments: [],
      isCommunity: true,
      created_at: p.created_at,
    }));
    return [...MOCK_PLACES, ...community];
  }, [dbPlaces]);

  const filtered = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    const arr = allPlaces.filter((p) =>
      (activeCats.size === 0 || activeCats.has(p.category))
      && budgets.has(p.budget)
      && (!q || p.country.toLowerCase().includes(q) || p.city.toLowerCase().includes(q))
    );
    if (sort === "popular") arr.sort((a, b) => b.reviews_count - a.reviews_count);
    else arr.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : parseInt(a.id.replace(/\D/g, "")) || 0;
      const tb = b.created_at ? Date.parse(b.created_at) : parseInt(b.id.replace(/\D/g, "")) || 0;
      return tb - ta;
    });
    return arr;
  }, [allPlaces, activeCats, budgets, countryQuery, sort]);

  const displayedPlaces = useMemo(() => filtered.slice(0, 600), [filtered]);

  const { data: locatedTravelers = [] } = useQuery({
    queryKey: ["located-travelers"],
    queryFn: fetchLocatedTravelers,
    staleTime: 60_000,
  });

  const filteredTravelers = useMemo(() => {
    if (!showTravelers) return [];
    const q = countryQuery.trim().toLowerCase();
    return locatedTravelers.filter((t) => !q || t.country.toLowerCase().includes(q) || t.city.toLowerCase().includes(q));
  }, [locatedTravelers, countryQuery, showTravelers]);


  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserPosition([coords.latitude, coords.longitude]);
        setUserAccuracy(Number.isFinite(coords.accuracy) ? Math.min(coords.accuracy, 5000) : null);
        setLocating(false);
        toast.success("Ta position est affichée sur la carte");
      },
      (error) => {
        setLocating(false);
        const message = error.code === error.PERMISSION_DENIED
          ? "Autorise la localisation dans ton navigateur pour te voir sur la carte."
          : "Impossible de récupérer ta position pour le moment.";
        toast.error(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
  };

  const toggleCat = (v: string) => {
    setActiveCats((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v); else n.add(v);
      return n;
    });
  };
  const toggleBudget = (b: 1 | 2 | 3 | 4) => {
    setBudgets((s) => {
      const n = new Set(s);
      if (n.has(b)) n.delete(b); else n.add(b);
      if (n.size === 0) return new Set([1, 2, 3, 4]);
      return n;
    });
  };

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 pb-8 pt-3 sm:px-4 sm:pt-5">
        <div className="map-hero surface-card flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-5">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl">Carte du monde</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {displayedPlaces.length} lieux · {filteredTravelers.length} voyageurs · clique un pays pour tout savoir
            </p>
          </div>
          <div className="map-actions grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button size="sm" variant={userPosition ? "default" : "outline"} className="min-w-0 rounded-xl px-2 sm:rounded-full sm:px-3" onClick={locateMe} disabled={locating}>
              {locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-1 h-4 w-4" />}
              <span className="sm:hidden">Position</span><span className="hidden sm:inline">{userPosition ? "Recentrer sur moi" : "Ma position"}</span>
            </Button>
            <Button asChild size="sm" variant="outline" className="min-w-0 rounded-xl px-2 sm:rounded-full sm:px-3">
              <Link to="/match"><Sparkles className="mr-1 h-4 w-4 text-accent" /><span className="sm:hidden">Match</span><span className="hidden sm:inline">Travel Match</span></Link>
            </Button>
            <Button size="sm" variant={showFilters ? "default" : "outline"} className="min-w-0 rounded-xl px-2 sm:rounded-full sm:px-3" onClick={() => setShowFilters((s) => !s)}>
              <Filter className="mr-1 h-4 w-4" /> Filtres
            </Button>
          </div>
        </div>

        {/* Country quick access */}
        <div className="map-country-card surface-subtle mt-3 p-3 sm:mt-4 sm:p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"><Globe2 className="h-3.5 w-3.5" /> Explorer par pays</div>
          <div className="map-country-strip -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {COUNTRY_INFO.map((c) => (
              <button
                key={c.code}
                onClick={() => setSelectedCountry(c.code)}
                className="compact-control shrink-0 snap-start inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition hover:border-primary hover:shadow-soft sm:text-sm"
              >
                <span>{c.emoji}</span> {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="map-category-strip mt-3 flex gap-2 overflow-x-auto rounded-[1.25rem] border border-border/60 bg-card/70 p-2.5 sm:mt-4 sm:flex-wrap sm:overflow-visible sm:rounded-[1.5rem] sm:p-3">
          <button
            onClick={() => setActiveCats(new Set())}
            className={[
              "compact-control inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
              activeCats.size === 0
                ? "border-primary bg-primary text-primary-foreground shadow-soft"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
            ].join(" ")}
          >
            Tout
          </button>
          <button
            onClick={() => setShowTravelers((v) => !v)}
            className={[
              "compact-control inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
              showTravelers
                ? "border-accent bg-accent text-accent-foreground shadow-soft"
                : "border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground",
            ].join(" ")}
          >
            <Users className="h-3.5 w-3.5" /> Voyageurs
          </button>
          {PLACE_CATEGORIES.map((c) => {
            const on = activeCats.has(c.value);
            return (
              <button
                key={c.value}
                onClick={() => toggleCat(c.value)}
                className={[
                  "compact-control inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all sm:text-sm",
                  on
                    ? "border-primary bg-primary text-primary-foreground shadow-soft"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                ].join(" ")}
              >
                <span>{c.emoji}</span>
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filters bar */}
        {showFilters && (
          <div className="surface-card mt-4 grid gap-3 rounded-[1.5rem] p-4 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pays / ville</label>
              <div className="relative">
                <Input value={countryQuery} onChange={(e) => setCountryQuery(e.target.value)} placeholder="Ex : Bali, Tokyo, Portugal…" className="rounded-full pr-8" />
                {countryQuery && (
                  <button onClick={() => setCountryQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget</label>
              <div className="flex gap-1">
                {([1, 2, 3, 4] as const).map((b) => {
                  const on = budgets.has(b);
                  return (
                    <button
                      key={b}
                      onClick={() => toggleBudget(b)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      {BUDGET_LABELS[b - 1]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trier par</label>
              <div className="flex gap-1">
                {(["popular", "recent"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSort(k)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      sort === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {k === "popular" ? "Popularité" : "Nouveautés"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      <div className="map-canvas-shell surface-card mx-auto mt-3 h-[58dvh] min-h-[420px] max-w-7xl overflow-hidden p-1 sm:mt-4 sm:h-[calc(100vh-18rem)] sm:min-h-[520px] sm:rounded-[2rem] sm:p-1.5">
        <ClientOnly fallback={<div className="grid h-full place-items-center bg-secondary text-muted-foreground">Chargement de la carte…</div>}>
          <LeafletMap
            places={displayedPlaces}
            travelers={filteredTravelers}
            onSelect={setSelected}
            onTraveler={setSelectedTraveler}
            onCountry={setSelectedCountry}
            userPosition={userPosition}
            userAccuracy={userAccuracy}
          />
        </ClientOnly>
      </div>

      <PlaceSheet place={selected} onOpenChange={(o) => !o && setSelected(null)} />
      <TravelerSheet traveler={selectedTraveler} onOpenChange={(o) => !o && setSelectedTraveler(null)} />
      <CountrySheet code={selectedCountry} onOpenChange={(o) => !o && setSelectedCountry(null)} />
      </main>
    </div>
  );
}

function LeafletMap({
  places, travelers, onSelect, onTraveler, onCountry, userPosition, userAccuracy,
}: {
  places: AnyPlace[];
  travelers: LocatedTraveler[];
  onSelect: (p: AnyPlace) => void;
  onTraveler: (t: LocatedTraveler) => void;
  onCountry: (code: string) => void;
  userPosition: [number, number] | null;
  userAccuracy: number | null;
}) {
  const [Mod, setMod] = useState<typeof import("react-leaflet") | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet")]).then(([rl, leaf]) => {
      setL(leaf);
      setMod(rl);
    });
  }, []);

  useEffect(() => {
    if (userPosition && mapRef.current) {
      mapRef.current.flyTo(userPosition, 13, { duration: 0.9 });
    }
  }, [userPosition]);

  if (!Mod || !L) return <div className="grid h-full place-items-center bg-secondary text-muted-foreground">Chargement…</div>;
  const { MapContainer, TileLayer, Marker, ZoomControl, Circle } = Mod;

  return (
    <MapContainer ref={mapRef} center={[20, 0]} zoom={2} className="h-full w-full" scrollWheelZoom worldCopyJump zoomControl={false}>
      <ZoomControl position="bottomright" />
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />


      {userPosition && userAccuracy && (
        <Circle center={userPosition} radius={userAccuracy} pathOptions={{ color: "#0ea5e9", fillColor: "#38bdf8", fillOpacity: 0.08, weight: 1 }} />
      )}
      {userPosition && (() => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:38px;height:38px;display:grid;place-items:center;"><span style="position:absolute;inset:0;border-radius:999px;background:rgba(14,165,233,.20);animation:marker-pulse 1.8s ease-out infinite"></span><span style="position:relative;width:19px;height:19px;border-radius:999px;background:#0ea5e9;border:4px solid white;box-shadow:0 6px 18px rgba(2,132,199,.38)"></span></div>`,
          iconSize: [38, 38], iconAnchor: [19, 19],
        });
        return <Marker position={userPosition} icon={icon} zIndexOffset={1000} />;
      })()}

      {COUNTRY_INFO.map((c) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:oklch(0.24 0.06 240);color:white;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-weight:600;font-size:12px;white-space:nowrap;border:2px solid white;"><span style="font-size:14px;">${c.emoji}</span>${c.name}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        return (
          <Marker key={"country-" + c.code} position={c.center as [number, number]} icon={icon}
            eventHandlers={{ click: () => onCountry(c.code) }} />
        );
      })}

      {places.map((p) => {
        const cat = PLACE_CATEGORIES.find((c) => c.value === p.category);
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:white;border:2px solid oklch(0.55 0.12 220);box-shadow:0 4px 12px rgba(0,0,0,0.25);font-size:18px;">${cat?.emoji ?? "📍"}</div>`,
          iconSize: [34, 34], iconAnchor: [17, 17],
        });
        return (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icon}
            eventHandlers={{ click: () => onSelect(p) }} />
        );
      })}

      {travelers.map((t) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:44px;height:44px;">
            <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(236,72,153,0.35),transparent 70%);animation:pulse 2s infinite;"></div>
            ${t.avatar
              ? `<img src="${t.avatar}" style="position:absolute;inset:4px;width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.35);"/>`
              : `<div style="position:absolute;inset:4px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:oklch(0.55 0.12 220);color:white;font:600 14px/1 sans-serif;border:2px solid white;">${(t.name || t.username).slice(0, 1).toUpperCase()}</div>`}
          </div>`,
          iconSize: [44, 44], iconAnchor: [22, 22],
        });
        return (
          <Marker key={"trav-" + t.id} position={[t.lat, t.lng]} icon={icon}
            eventHandlers={{ click: () => onTraveler(t) }} />
        );
      })}
    </MapContainer>
  );
}

function PlaceSheet({ place, onOpenChange }: { place: AnyPlace | null; onOpenChange: (o: boolean) => void }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [place?.id]);

  const share = async () => {
    if (!place) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: place.name, text: place.description, url });
      else { await navigator.clipboard.writeText(`${place.name} — ${url}`); toast.success("Lien copié"); }
    } catch { /* cancelled */ }
  };

  const cat = place ? PLACE_CATEGORIES.find((c) => c.value === place.category) : null;

  return (
    <Sheet open={!!place} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {place && (
          <>
            <div className="relative h-64 w-full overflow-hidden">
              <img src={place.image_url} alt={place.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <Badge className="mb-2 border-white/30 bg-white/20 text-white backdrop-blur">
                  {cat?.emoji} {cat?.label}
                </Badge>
                <div className="flex items-center gap-1.5 text-sm text-white/90">
                  <MapPin className="h-3.5 w-3.5" /> {[place.city, place.country].filter(Boolean).join(", ")}
                </div>
              </div>
            </div>

            <div className="p-5">
              <SheetHeader className="p-0 text-left">
                <SheetTitle className="font-display text-2xl leading-tight">{place.name}</SheetTitle>
              </SheetHeader>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="flex items-center gap-1 font-semibold">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {place.rating.toFixed(1)}
                  <span className="font-normal text-muted-foreground">({place.reviews_count} avis)</span>
                </div>
                <span className="text-muted-foreground">·</span>
                <div className="font-semibold text-primary">{"€".repeat(place.budget)}<span className="font-normal text-muted-foreground">{"€".repeat(4 - place.budget)}</span></div>
                <span className="text-muted-foreground">·</span>
                <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {place.hours}</div>
              </div>

              <p className="mt-4 text-sm leading-relaxed">{place.description}</p>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button variant={saved ? "default" : "outline"} onClick={() => { setSaved((s) => !s); toast.success(saved ? "Retiré des favoris" : "Ajouté aux favoris"); }}>
                  <Bookmark className={"mr-2 h-4 w-4 " + (saved ? "fill-current" : "")} /> {saved ? "Enregistré" : "Enregistrer"}
                </Button>
                <Button variant="outline" onClick={share}><Share2 className="mr-2 h-4 w-4" /> Partager</Button>
              </div>

              {place.photos.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold">Photos</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {place.photos.map((src, i) => (
                      <div key={i} className="aspect-square overflow-hidden rounded-lg">
                        <img src={src} alt="" className="h-full w-full object-cover transition hover:scale-105" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {place.comments.length > 0 && (
                <div className="mt-6 mb-4">
                  <h3 className="mb-3 text-sm font-semibold">Commentaires récents</h3>
                  <div className="space-y-3">
                    {place.comments.map((c, i) => (
                      <div key={i} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                        <img src={c.avatar} alt={c.author} className="h-9 w-9 rounded-full object-cover" />
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{c.author}</div>
                          <p className="text-sm text-muted-foreground">{c.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TravelerSheet({ traveler, onOpenChange }: { traveler: LocatedTraveler | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={!!traveler} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
        {traveler && (
          <div>
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-pink-500 to-purple-600">
              {traveler.avatar && <img src={traveler.avatar} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-xl" />}
              <div className="absolute inset-0 flex items-end p-5">
                <div className="flex items-end gap-4">
                  {traveler.avatar
                    ? <img src={traveler.avatar} alt={traveler.name} className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-elevated" />
                    : <span className="grid h-24 w-24 place-items-center rounded-full border-4 border-white bg-primary text-3xl font-semibold text-primary-foreground shadow-elevated">{(traveler.name || traveler.username).slice(0, 1).toUpperCase()}</span>}
                  <div className="pb-1 text-white">
                    <div className="text-xs uppercase tracking-widest opacity-80">{traveler.source === "trip" ? "Sur place actuellement" : "Localisé ici"}</div>
                    <div className="font-display text-2xl">{traveler.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-sm opacity-90"><MapPin className="h-3.5 w-3.5" /> {[traveler.city, traveler.country].filter(Boolean).join(", ")}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm">{traveler.bio}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Sur place</div>
                  <div className="text-sm font-semibold">
                    {traveler.starts_on && traveler.ends_on ? `${traveler.starts_on} → ${traveler.ends_on}` : "Voyageur basé ici"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Budget</div>
                  <div className="text-sm font-semibold">{traveler.budget_eur ? `${traveler.budget_eur} €` : "Non renseigné"}</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Langues</div>
                <div className="flex flex-wrap gap-1.5">{traveler.languages.map((l) => <Badge key={l} variant="secondary" className="rounded-full">{l}</Badge>)}</div>
              </div>
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Centres d'intérêt</div>
                <div className="flex flex-wrap gap-1.5">{traveler.interests.map((l) => <Badge key={l} className="rounded-full">{l}</Badge>)}</div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button asChild className="rounded-full gradient-hero text-primary-foreground">
                  <Link to="/profile/$username" params={{ username: traveler.username }}>Voir le profil</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/match"><Sparkles className="mr-1 h-4 w-4" /> Travel Match</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
