import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, ArrowRight, RefreshCw, ExternalLink, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import {
  dailyRefreshLabel,
  fetchLiveCatalog,
  catalogOfficialWebsite,
  itemLocation,
  itemPrice,
  catalogSourceLabel,
  type LiveCatalogItem,
} from "@/lib/live-catalog";
import { dailyWorldActivitySelection } from "@/lib/world-activities";
import { CatalogImage } from "@/components/CatalogImage";

export const Route = createFileRoute("/deals/")({
  head: () => ({
    meta: [
      { title: "Sélection du moment — GlobeLink" },
      {
        name: "description",
        content:
          "Sélection de lieux, activités et offres réelles avec lien vers la source d'origine.",
      },
      { property: "og:title", content: "Sélection du moment — GlobeLink" },
      {
        property: "og:description",
        content: "Une sélection réelle renouvelée automatiquement avec sources vérifiables.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DealsPage,
});

function DealsPage() {
  const instantSelection = {
    items: selectFallbackSelection(dailyWorldActivitySelection(18)),
    mode: "selection" as const,
  };

  const {
    data: selection,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["live-catalog", "deals-with-fallback-selection"],
    queryFn: async () => {
      const deals = await fetchLiveCatalog({ kinds: ["deal"], limit: 60 });
      if (deals.length) return { items: deals, mode: "offers" as const };

      const fallbackItems = await fetchLiveCatalog({
        kinds: ["activity", "restaurant", "hotel"],
        limit: 90,
      });
      return { items: selectFallbackSelection(fallbackItems), mode: "selection" as const };
    },
    initialData: instantSelection,
    initialDataUpdatedAt: 0,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  const items = selection?.items ?? [];
  const hasRealOffers = selection?.mode === "offers";
  const pageTitle = hasRealOffers ? "Offres du moment" : "Sélection du moment";
  const pageSubtitle = hasRealOffers
    ? "Offres voyage issues de fournisseurs externes. Vérifie toujours le prix final sur la source."
    : "Lieux et activités réels issus de sources vérifiables, alignés avec la sélection de l’accueil.";
  const lastRefresh = hasRealOffers && items[0]?.fetched_at
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(
        new Date(items[0].fetched_at),
      )
    : null;

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
        <header className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl gradient-sunset text-white shadow-soft">
              <Flame className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl">{pageTitle}</h1>
              <p className="text-sm text-muted-foreground">{pageSubtitle}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
              <RefreshCw
                className={`h-3.5 w-3.5 text-accent ${isFetching ? "animate-spin" : ""}`}
              />{" "}
              {lastRefresh
                ? `Mise à jour : ${lastRefresh}`
                : isFetching
                  ? "Sélection affichée · actualisation en arrière-plan"
                  : `Sélection directe disponible · ${dailyRefreshLabel()}`}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Sources réelles, prix et horaires
              à vérifier avant réservation
            </span>
          </div>
        </header>

        {isLoading && items.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-3xl bg-secondary" />
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <h2 className="font-display text-xl">La collecte ne répond pas</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Vérifie que les tables GlobeLink et la fonction Supabase ont bien été déployées.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center sm:p-12">
            <RefreshCw className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-4 font-display text-xl">Aucune sélection disponible</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              La récupération internet n’a rien trouvé pour le moment. Réessaie plus tard ou explore
              directement la carte.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => {
              const actualDeal = item.kind === "deal";
              const destination = actualDeal
                ? ("/deals/$slug" as const)
                : ("/activities/$slug" as const);
              return (
                <Link
                  key={item.id}
                  to={destination}
                  params={{ slug: item.slug }}
                  style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
                  className="animate-rise group overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:shadow-elevated"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/15 via-secondary to-accent/15">
                    <CatalogImage
                      item={item}
                      lookup={{
                        latitude: item.latitude,
                        longitude: item.longitude,
                        city: item.city,
                        country: item.country,
                        website: catalogOfficialWebsite(item),
                      }}
                      priority={index === 0}
                      fallbackIndex={index}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                    <span className="absolute left-3 top-3 max-w-[70%] truncate rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-soft backdrop-blur">
                      {actualDeal ? item.category || "Offre" : kindLabel(item.kind)}
                    </span>
                    <span className="absolute right-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-soft backdrop-blur">
                      {catalogSourceLabel(item)}
                    </span>
                  </div>
                  <div className="p-4 sm:p-5">
                    <h2 className="line-clamp-2 font-display text-lg leading-snug">{item.title}</h2>
                    <p className="mt-1 min-h-5 truncate text-xs text-muted-foreground">
                      {itemLocation(item) || (actualDeal ? "Offre en ligne" : "Source vérifiable")}
                    </p>
                    {item.description && (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <span className="font-display text-xl text-accent sm:text-2xl">
                        {itemPrice(item)}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium">
                        {actualDeal ? "Détails" : "Voir"} <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mt-8 flex items-start gap-2 rounded-2xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground">
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" /> Les informations viennent de sources
          externes. Vérifie les prix, horaires et disponibilités avant de réserver ou de te
          déplacer.
        </p>
      </main>
    </div>
  );
}

function selectFallbackSelection(items: LiveCatalogItem[]) {
  const seen = new Set<string>();
  return items
    .filter((item) => item.kind !== "deal" && (item.booking_url || item.source_url))
    .filter((item) => {
      const key = `${item.provider}:${item.external_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => catalogQualityScore(b) - catalogQualityScore(a))
    .slice(0, 60)
    .map((item) => ({ ...item, price_text: item.price_text || "Voir la source" }));
}

function catalogQualityScore(item: LiveCatalogItem) {
  return (
    (item.booking_url ? 4 : 0) +
    (item.source_url ? 2 : 0) +
    (item.image_url ? 2 : 0) +
    (item.rating != null ? 1 : 0) +
    (item.reviews_count > 0 ? 1 : 0)
  );
}

function kindLabel(kind: LiveCatalogItem["kind"]) {
  if (kind === "restaurant") return "Restaurant";
  if (kind === "hotel") return "Hôtel";
  if (kind === "activity") return "Activité";
  return "Offre";
}
