import { ClientOnly, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Globe2,
  ImageOff,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
  Share2,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { CountrySheet } from "@/components/CountrySheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { COUNTRY_INFO } from "@/lib/country-info";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/lib/countries";
import { fetchLocatedTravelers, type LocatedTraveler } from "@/lib/real-travelers";
import {
  discoverVerifiedTravelPlaces,
  type TravelProvider,
  type VerifiedTravelPlace,
} from "@/lib/travel-apis.functions";

type AnyPlace = VerifiedTravelPlace & { isCommunity?: boolean; created_at?: string };
type SortKey = "popular" | "recent";

const BUDGET_LABELS = ["€", "€€", "€€€", "€€€€"];

function providerLabel(provider: TravelProvider) {
  switch (provider) {
    case "google": return "Google Places";
    case "amadeus": return "Amadeus";
    case "ticketmaster": return "Ticketmaster";
    case "community": return "Communauté GlobeLink";
  }
}

function ProviderChip({ name, state }: { name: string; state?: { configured: boolean; ok: boolean; count: number } }) {
  if (!state) return null;
  const live = state.configured && state.ok;
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        live
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : state.configured
            ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border bg-secondary text-muted-foreground",
      ].join(" ")}
      title={state.configured ? (state.ok ? `${state.count} résultat(s) vérifié(s)` : "API configurée mais indisponible sur cette recherche") : "Clé API non configurée"}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : state.configured ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
      {name}{live ? ` · ${state.count}` : ""}
    </span>
  );
}

export function VerifiedTravelMapPage() {
  const loadVerifiedPlaces = useServerFn(discoverVerifiedTravelPlaces);
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());
  const [budgets, setBudgets] = useState<Set<1 | 2 | 3 | 4>>(new Set([1, 2, 3, 4]));
  const [countryQuery, setCountryQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [showTravelers, setShowTravelers] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<AnyPlace | null>(null);
  const [selectedTraveler, setSelectedTraveler] = useState<LocatedTraveler | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(countryQuery.trim()), 450);
    return () => clearTimeout(timeout);
  }, [countryQuery]);

  const { data: dbPlaces = [] } = useQuery({
    queryKey: ["places"],
    queryFn: async () => {
      const { data, error } = await supabase.from("places").select("*").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: discovery, isFetching: isFetchingVerified } = useQuery({
    queryKey: ["verified-travel-places", debouncedQuery, userPosition?.[0]?.toFixed(3), userPosition?.[1]?.toFixed(3)],
    queryFn: () => loadVerifiedPlaces({
      data: {
        query: debouncedQuery || undefined,
        lat: !debouncedQuery ? userPosition?.[0] : undefined,
        lng: !debouncedQuery ? userPosition?.[1] : undefined,
      },
    }),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });

  const communityPlaces: AnyPlace[] = useMemo(() => (dbPlaces ?? []).flatMap((place) => {
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !place.name) return [];
    return [{
      id: `community-${place.id}`,
      name: place.name,
      category: (place.category || "cache") as PlaceCategory,
      country: place.country ?? "",
      city: place.city ?? "",
      lat,
      lng,
      description: place.description ?? "",
      image_url: place.image_url ?? "",
      photos: place.image_url ? [place.image_url] : [],
      budget: null,
      rating: null,
      reviews_count: 0,
      hours: "",
      comments: [],
      source: "community" as const,
      sourceUrl: "",
      isCommunity: true,
      created_at: place.created_at,
    }];
  }), [dbPlaces]);

  const allPlaces = useMemo<AnyPlace[]>(() => [
    ...(discovery?.places ?? []),
    ...communityPlaces,
  ], [discovery?.places, communityPlaces]);

  const filtered = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    const items = allPlaces.filter((place) => (
      (activeCats.size === 0 || activeCats.has(place.category))
      && (place.budget === null || budgets.has(place.budget))
      && (!q || debouncedQuery.length > 0 || place.country.toLowerCase().includes(q) || place.city.toLowerCase().includes(q) || place.name.toLowerCase().includes(q))
    ));
    if (sort === "popular") {
      items.sort((a, b) => (b.reviews_count ?? 0) - (a.reviews_count ?? 0));
    } else {
      items.sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));
    }
    return items.slice(0, 600);
  }, [allPlaces, activeCats, budgets, countryQuery, debouncedQuery, sort]);

  const { data: locatedTravelers = [] } = useQuery({
    queryKey: ["located-travelers"],
    queryFn: fetchLocatedTravelers,
    staleTime: 60_000,
  });

  const filteredTravelers = useMemo(() => {
    if (!showTravelers) return [];
    const q = countryQuery.trim().toLowerCase();
    return locatedTravelers.filter((traveler) => !q || traveler.country.toLowerCase().includes(q) || traveler.city.toLowerCase().includes(q));
  }, [locatedTravelers, countryQuery, showTravelers]);

  const verifiedCount = (discovery?.places ?? []).length;

  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCountryQuery("");
        setUserPosition([coords.latitude, coords.longitude]);
        setUserAccuracy(Number.isFinite(coords.accuracy) ? Math.min(coords.accuracy, 5000) : null);
        setLocating(false);
        toast.success("Recherche des lieux vérifiés autour de toi");
      },
      (error) => {
        setLocating(false);
        toast.error(error.code === error.PERMISSION_DENIED
          ? "Autorise la localisation dans ton navigateur pour lancer la recherche autour de toi."
          : "Impossible de récupérer ta position pour le moment.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 120_000 },
    );
  };

  const toggleCat = (value: string) => setActiveCats((current) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  });

  const toggleBudget = (budget: 1 | 2 | 3 | 4) => setBudgets((current) => {
    const next = new Set(current);
    if (next.has(budget)) next.delete(budget); else next.add(budget);
    return next.size ? next : new Set([1, 2, 3, 4]);
  });

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 pb-8 pt-3 sm:px-4 sm:pt-5">
        <section className="surface-card rounded-[1.75rem] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
                <CheckCircle2 className="h-4 w-4" /> Sources vérifiées
              </div>
              <h1 className="mt-1 font-display text-2xl sm:text-3xl">Carte du monde</h1>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {verifiedCount} lieux issus d'API · {communityPlaces.length} lieux communauté · {filteredTravelers.length} voyageurs
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ProviderChip name="Google" state={discovery?.providers.google} />
                <ProviderChip name="Amadeus" state={discovery?.providers.amadeus} />
                <ProviderChip name="Ticketmaster" state={discovery?.providers.ticketmaster} />
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 xl:max-w-2xl">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={countryQuery}
                    onChange={(event) => setCountryQuery(event.target.value.slice(0, 80))}
                    placeholder="Ville ou pays : Tunis, Tokyo, Bali…"
                    className="h-11 rounded-xl pl-9 pr-9"
                  />
                  {isFetchingVerified ? (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-accent" />
                  ) : countryQuery ? (
                    <button type="button" onClick={() => setCountryQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Effacer la recherche">
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <Button type="button" variant={userPosition ? "default" : "outline"} className="h-11 rounded-xl" onClick={locateMe} disabled={locating}>
                  {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  <span className="hidden sm:inline">Autour de moi</span>
                </Button>
                <Button type="button" variant={showFilters ? "default" : "outline"} className="h-11 rounded-xl" onClick={() => setShowFilters((value) => !value)}>
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filtres</span>
                </Button>
              </div>
              {discovery?.anchor?.label && (
                <p className="px-1 text-[11px] text-muted-foreground">
                  Zone chargée : <strong className="text-foreground">{discovery.anchor.label}</strong>. Une recherche texte remplace automatiquement la zone précédente.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="surface-subtle mt-3 rounded-[1.5rem] p-3 sm:mt-4 sm:p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"><Globe2 className="h-3.5 w-3.5" /> Explorer par pays</div>
          <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
            {COUNTRY_INFO.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => {
                  setSelectedCountry(country.code);
                  setCountryQuery(country.name);
                }}
                className="compact-control shrink-0 snap-start rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition hover:border-primary sm:text-sm"
              >
                {country.emoji} {country.name}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 flex gap-2 overflow-x-auto rounded-[1.5rem] border border-border/60 bg-card/70 p-2.5 sm:mt-4 sm:flex-wrap sm:overflow-visible sm:p-3">
          <button
            type="button"
            onClick={() => setActiveCats(new Set())}
            className={`compact-control min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium sm:text-sm ${activeCats.size === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
          >
            Tout
          </button>
          <button
            type="button"
            onClick={() => setShowTravelers((value) => !value)}
            className={`compact-control inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:text-sm ${showTravelers ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground"}`}
          >
            <Users className="h-3.5 w-3.5" /> Voyageurs
          </button>
          {PLACE_CATEGORIES.map((category) => (
            <button
              key={category.value}
              type="button"
              onClick={() => toggleCat(category.value)}
              className={`compact-control inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:text-sm ${activeCats.has(category.value) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
            >
              {category.emoji} {category.label}
            </button>
          ))}
        </section>

        {showFilters && (
          <section className="surface-card mt-3 grid gap-3 rounded-[1.5rem] p-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget connu</label>
              <div className="flex gap-1">
                {([1, 2, 3, 4] as const).map((budget) => (
                  <button
                    key={budget}
                    type="button"
                    onClick={() => toggleBudget(budget)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${budgets.has(budget) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
                  >
                    {BUDGET_LABELS[budget - 1]}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Les lieux sans niveau de prix fourni par la source restent visibles.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trier par</label>
              <div className="flex gap-1">
                {(["popular", "recent"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${sort === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
                  >
                    {key === "popular" ? "Popularité" : "Nouveautés"}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="surface-card mx-auto mt-3 h-[58dvh] min-h-[420px] max-w-7xl overflow-hidden p-1 sm:mt-4 sm:h-[calc(100vh-18rem)] sm:min-h-[520px] sm:rounded-[2rem] sm:p-1.5">
          <ClientOnly fallback={<div className="grid h-full place-items-center bg-secondary text-muted-foreground">Chargement de la carte…</div>}>
            <LeafletMap
              places={filtered}
              travelers={filteredTravelers}
              onSelect={setSelected}
              onTraveler={setSelectedTraveler}
              onCountry={(code) => setSelectedCountry(code)}
              userPosition={userPosition}
              userAccuracy={userAccuracy}
              anchor={discovery ? [discovery.anchor.lat, discovery.anchor.lng] : null}
            />
          </ClientOnly>
        </div>

        {!isFetchingVerified && discovery && verifiedCount === 0 && (
          <div className="mt-3 rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Aucune fiche fournisseur vérifiée n'a été renvoyée pour cette zone. GlobeLink n'invente pas de lieu ni de photo de remplacement.
          </div>
        )}

        <PlaceSheet place={selected} onOpenChange={(open) => !open && setSelected(null)} />
        <TravelerSheet traveler={selectedTraveler} onOpenChange={(open) => !open && setSelectedTraveler(null)} />
        <CountrySheet code={selectedCountry} onOpenChange={(open) => !open && setSelectedCountry(null)} />
      </main>
    </div>
  );
}

function LeafletMap({
  places,
  travelers,
  onSelect,
  onTraveler,
  onCountry,
  userPosition,
  userAccuracy,
  anchor,
}: {
  places: AnyPlace[];
  travelers: LocatedTraveler[];
  onSelect: (place: AnyPlace) => void;
  onTraveler: (traveler: LocatedTraveler) => void;
  onCountry: (code: string) => void;
  userPosition: [number, number] | null;
  userAccuracy: number | null;
  anchor: [number, number] | null;
}) {
  const [Mod, setMod] = useState<typeof import("react-leaflet") | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet")]).then(([reactLeaflet, leaflet]) => {
      setMod(reactLeaflet);
      setL(leaflet);
    });
  }, []);

  useEffect(() => {
    const target = userPosition ?? anchor;
    if (target && mapRef.current) mapRef.current.flyTo(target, userPosition ? 12 : 10, { duration: 0.8 });
  }, [userPosition, anchor?.[0], anchor?.[1]]);

  if (!Mod || !L) return <div className="grid h-full place-items-center bg-secondary text-muted-foreground">Chargement…</div>;
  const { MapContainer, TileLayer, Marker, ZoomControl, Circle } = Mod;

  return (
    <MapContainer ref={mapRef} center={[20, 0]} zoom={2} className="h-full w-full" scrollWheelZoom worldCopyJump zoomControl={false}>
      <ZoomControl position="bottomright" />
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

      {userPosition && userAccuracy && (
        <Circle center={userPosition} radius={userAccuracy} pathOptions={{ color: "#0ea5e9", fillColor: "#38bdf8", fillOpacity: 0.08, weight: 1 }} />
      )}
      {userPosition && (
        <Marker
          position={userPosition}
          zIndexOffset={1000}
          icon={L.divIcon({
            className: "",
            html: '<div style="position:relative;width:38px;height:38px;display:grid;place-items:center"><span style="position:absolute;inset:0;border-radius:999px;background:rgba(14,165,233,.20)"></span><span style="position:relative;width:19px;height:19px;border-radius:999px;background:#0ea5e9;border:4px solid white;box-shadow:0 6px 18px rgba(2,132,199,.38)"></span></div>',
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          })}
        />
      )}

      {COUNTRY_INFO.map((country) => (
        <Marker
          key={`country-${country.code}`}
          position={country.center as [number, number]}
          icon={L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:oklch(0.24 0.06 240);color:white;box-shadow:0 8px 20px rgba(0,0,0,.25);font-weight:600;font-size:12px;white-space:nowrap;border:2px solid white"><span>${country.emoji}</span>${country.name}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
          eventHandlers={{ click: () => onCountry(country.code) }}
        />
      ))}

      {places.map((place) => {
        const category = PLACE_CATEGORIES.find((item) => item.value === place.category);
        const verified = place.source !== "community";
        return (
          <Marker
            key={place.id}
            position={[place.lat, place.lng]}
            icon={L.divIcon({
              className: "",
              html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:white;border:2px solid ${verified ? "#10b981" : "#64748b"};box-shadow:0 4px 12px rgba(0,0,0,.25);font-size:18px">${category?.emoji ?? "📍"}${verified ? '<span style="position:absolute;right:-2px;top:-2px;width:9px;height:9px;border-radius:50%;background:#10b981;border:2px solid white"></span>' : ""}</div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            })}
            eventHandlers={{ click: () => onSelect(place) }}
          />
        );
      })}

      {travelers.map((traveler) => (
        <Marker
          key={`traveler-${traveler.id}`}
          position={[traveler.lat, traveler.lng]}
          icon={L.divIcon({
            className: "",
            html: traveler.avatar
              ? `<img src="${traveler.avatar}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,.35)"/>`
              : `<div style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#db2777;color:white;font:600 14px sans-serif;border:2px solid white">${(traveler.name || traveler.username).slice(0, 1).toUpperCase()}</div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          })}
          eventHandlers={{ click: () => onTraveler(traveler) }}
        />
      ))}
    </MapContainer>
  );
}

function PlaceSheet({ place, onOpenChange }: { place: AnyPlace | null; onOpenChange: (open: boolean) => void }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [place?.id]);

  const share = async () => {
    if (!place) return;
    const url = place.sourceUrl || (typeof window !== "undefined" ? window.location.href : "");
    try {
      if (navigator.share) await navigator.share({ title: place.name, text: place.description, url });
      else {
        await navigator.clipboard.writeText(`${place.name} — ${url}`);
        toast.success("Lien copié");
      }
    } catch {
      // User cancelled the share sheet.
    }
  };

  const category = place ? PLACE_CATEGORIES.find((item) => item.value === place.category) : null;

  return (
    <Sheet open={!!place} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        {place && (
          <>
            <div className="relative h-64 w-full overflow-hidden bg-secondary">
              {place.image_url ? (
                <img src={place.image_url} alt={place.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-center text-muted-foreground">
                  <div><ImageOff className="mx-auto h-8 w-8" /><p className="mt-2 text-sm font-medium">Photo vérifiée indisponible</p></div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge className="border-white/30 bg-black/30 text-white backdrop-blur">{category?.emoji} {category?.label}</Badge>
                  <Badge className="border-white/30 bg-emerald-600/80 text-white backdrop-blur">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> {providerLabel(place.source)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-white/90"><MapPin className="h-3.5 w-3.5" /> {[place.city, place.country].filter(Boolean).join(", ")}</div>
              </div>
            </div>

            <div className="p-5">
              <SheetHeader className="p-0 text-left"><SheetTitle className="font-display text-2xl leading-tight">{place.name}</SheetTitle></SheetHeader>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                {place.rating !== null ? (
                  <span className="inline-flex items-center gap-1 font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {place.rating.toFixed(1)}{place.reviews_count > 0 && <span className="font-normal text-muted-foreground">({place.reviews_count} avis)</span>}</span>
                ) : <span className="text-muted-foreground">Note non fournie</span>}
                {place.budget !== null && <><span className="text-muted-foreground">·</span><span className="font-semibold text-primary">{"€".repeat(place.budget)}</span></>}
                {place.priceLabel && <><span className="text-muted-foreground">·</span><span className="font-semibold text-primary">{place.priceLabel}</span></>}
              </div>

              {place.hours && <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {place.hours}</div>}
              {place.description && <p className="mt-4 text-sm leading-relaxed">{place.description}</p>}

              {place.photoAttribution && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Photo : {place.photoAttributionUrl ? <a href={place.photoAttributionUrl} target="_blank" rel="noopener noreferrer" className="underline">{place.photoAttribution}</a> : place.photoAttribution}
                </p>
              )}

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button variant={saved ? "default" : "outline"} onClick={() => {
                  setSaved((value) => !value);
                  toast.success(saved ? "Retiré des favoris" : "Ajouté aux favoris");
                }}>
                  <Bookmark className={`mr-2 h-4 w-4 ${saved ? "fill-current" : ""}`} /> {saved ? "Enregistré" : "Enregistrer"}
                </Button>
                <Button variant="outline" onClick={share}><Share2 className="mr-2 h-4 w-4" /> Partager</Button>
              </div>

              {place.sourceUrl && (
                <Button asChild className="mt-2 w-full rounded-xl">
                  <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer">
                    Voir la fiche officielle <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}

              {place.photos.length > 1 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold">Photos fournies par la source</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {place.photos.slice(0, 6).map((src, index) => (
                      <div key={`${src}-${index}`} className="aspect-square overflow-hidden rounded-lg"><img src={src} alt="" className="h-full w-full object-cover" /></div>
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

function TravelerSheet({ traveler, onOpenChange }: { traveler: LocatedTraveler | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={!!traveler} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
        {traveler && (
          <div>
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-pink-500 to-purple-600">
              {traveler.avatar && <img src={traveler.avatar} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-sm" />}
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute inset-x-5 bottom-5 flex items-end gap-3 text-white">
                {traveler.avatar ? <img src={traveler.avatar} alt="" className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-lg" /> : <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-primary text-2xl font-bold">{traveler.name.slice(0, 1)}</div>}
                <div className="min-w-0 pb-1">
                  <div className="font-display text-2xl">{traveler.name}</div>
                  <div className="mt-1 flex items-center gap-1 text-sm opacity-90"><MapPin className="h-3.5 w-3.5" /> {[traveler.city, traveler.country].filter(Boolean).join(", ")}</div>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm">{traveler.bio}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">{traveler.languages.map((language) => <Badge key={language} variant="secondary">{language}</Badge>)}</div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button asChild className="rounded-full"><Link to="/profile/$username" params={{ username: traveler.username }}>Voir le profil</Link></Button>
                <Button asChild variant="outline" className="rounded-full"><Link to="/match"><Sparkles className="mr-1 h-4 w-4" /> Travel Match</Link></Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
