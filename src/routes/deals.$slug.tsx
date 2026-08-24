import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Flame, MapPin, ShieldCheck, RefreshCw, Star } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { CatalogImage } from "@/components/CatalogImage";
import {
  fetchLiveCatalog,
  fetchLiveDeal,
  catalogOfficialWebsite,
  itemLocation,
  itemPrice,
  catalogSourceLabel,
  reservationLabel,
  reservationUrl,
} from "@/lib/live-catalog";

export const Route = createFileRoute("/deals/$slug")({
  head: () => ({
    meta: [{ title: "Offre du moment — GlobeLink" }, { name: "robots", content: "index,follow" }],
  }),
  component: DealPage,
});

function DealPage() {
  const { slug } = Route.useParams();
  const { data: deal, isLoading } = useQuery({
    queryKey: ["live-deal", slug],
    queryFn: () => fetchLiveDeal(slug),
    staleTime: 5 * 60_000,
  });
  const { data: others = [] } = useQuery({
    queryKey: ["live-catalog", "deals", "others"],
    queryFn: () => fetchLiveCatalog({ kinds: ["deal"], limit: 5 }),
    staleTime: 10 * 60_000,
  });

  if (isLoading)
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center text-muted-foreground">
          Chargement de l’offre…
        </div>
      </div>
    );
  if (!deal)
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="font-display text-2xl">Offre indisponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Elle a expiré, a été retirée de sa source ou supprimée par l’administration.
          </p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/deals">Voir les offres actuelles</Link>
          </Button>
        </div>
      </div>
    );

  const sourceHref = reservationUrl(deal);
  const related = others.filter((item) => item.slug !== deal.slug).slice(0, 3);
  const fetchedLabel = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(deal.fetched_at));

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-3 py-5 sm:px-4 sm:py-7">
        <Link
          to="/deals"
          className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Toutes les offres
        </Link>

        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft sm:rounded-3xl">
          <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary/15 via-secondary to-accent/15 sm:aspect-[16/9]">
            <CatalogImage
              item={deal}
              lookup={{
                latitude: deal.latitude,
                longitude: deal.longitude,
                city: deal.city,
                country: deal.country,
                website: catalogOfficialWebsite(deal),
              }}
              priority
              showAttribution
              className="h-full w-full object-cover"
            />
            <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold shadow-soft backdrop-blur sm:left-4 sm:top-4">
              {deal.category || "Offre"}
            </span>
            <span className="absolute right-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur sm:right-4 sm:top-4">
              {catalogSourceLabel(deal)}
            </span>
          </div>

          <div className="p-5 sm:p-7">
            <h1 className="font-display text-2xl leading-tight sm:text-3xl">{deal.title}</h1>
            {itemLocation(deal) && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-accent" /> {itemLocation(deal)}
              </p>
            )}
            {deal.rating != null && (
              <p className="mt-2 flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {deal.rating.toFixed(1)}
              </p>
            )}

            {deal.description ? (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-foreground/85">
                {deal.description}
              </p>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                La source ne fournit pas encore de description détaillée.
              </p>
            )}

            <div className="mt-6 grid gap-2 text-sm">
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Source originale
                conservée : GlobeLink ne réécrit pas le prix ni la disponibilité.
              </p>
              <p className="flex items-start gap-2">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> Collectée le{" "}
                {fetchedLabel}. Les offres expirées sont retirées automatiquement.
              </p>
            </div>

            <div className="mt-7 flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <span className="font-display text-2xl text-accent sm:text-3xl">
                  {itemPrice(deal)}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Prix indicatif, à confirmer avant paiement.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild size="lg" className="rounded-full">
                  <a href={sourceHref} target="_blank" rel="noopener noreferrer sponsored">
                    {reservationLabel(deal)} <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                {deal.source_url && deal.source_url !== sourceHref && (
                  <a
                    href={deal.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    Voir la fiche source
                  </a>
                )}
              </div>
            </div>
          </div>
        </article>

        {related.length > 0 && (
          <section className="mt-9">
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl">
              <Flame className="h-5 w-5 text-accent" /> Autres offres actuelles
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.id}
                  to="/deals/$slug"
                  params={{ slug: item.slug }}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-1"
                >
                  <div className="aspect-[16/10] bg-secondary">
                    <CatalogImage
                      item={item}
                      lookup={{
                        latitude: item.latitude,
                        longitude: item.longitude,
                        city: item.city,
                        country: item.country,
                        website: catalogOfficialWebsite(item),
                      }}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-accent">{itemPrice(item)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
