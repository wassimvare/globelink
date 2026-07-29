import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Flame, MapPin, Sparkles, ShieldCheck, RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { getDeal, dealsOfTheDay, dealsRefreshLabel, type Deal } from "@/lib/deals";

export const Route = createFileRoute("/deals/$slug")({
  loader: ({ params }): { deal: Deal } => {
    const deal = getDeal(params.slug);
    if (!deal) throw notFound();
    return { deal };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Offre indisponible — GlobeLink" }, { name: "robots", content: "noindex" }] };
    }
    const { deal } = loaderData;
    const title = `${deal.title} — ${deal.price} | GlobeLink`;
    return {
      meta: [
        { title },
        { name: "description", content: deal.description.slice(0, 155) },
        { property: "og:title", content: title },
        { property: "og:description", content: deal.description.slice(0, 155) },
        { property: "og:type", content: "website" },
        { property: "og:image", content: deal.image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: deal.image },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl">Offre indisponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cette offre n'est plus dans la sélection du jour.</p>
        <Link to="/deals" className="mt-6 inline-flex rounded-full gradient-hero px-5 py-2 text-sm text-primary-foreground">Voir les offres du jour</Link>
      </div>
    </div>
  ),
  component: DealPage,
});

function DealPage() {
  const { deal } = Route.useLoaderData();
  const others = dealsOfTheDay(4).filter((d) => d.slug !== deal.slug).slice(0, 3);

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link to="/deals" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Toutes les offres
        </Link>

        <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="relative aspect-[16/9]">
            <img src={deal.image} alt={deal.title} className="h-full w-full object-cover" />
            <span className="absolute left-4 top-4 rounded-full gradient-sunset px-3 py-1 text-xs font-semibold text-white shadow-soft">{deal.badge}</span>
            <span className="absolute right-4 top-4 rounded-full glass px-3 py-1 text-xs font-medium text-white">{deal.category}</span>
          </div>

          <div className="p-6">
            <h1 className="font-display text-3xl">{deal.title}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-accent" /> {deal.destination}
              {deal.from !== "—" && <span className="ml-2">· Départ : {deal.from}</span>}
            </p>

            <p className="mt-5 text-sm leading-relaxed text-foreground/85">{deal.description}</p>

            <ul className="mt-5 grid gap-2 text-sm">
              {deal.highlights.map((h: string) => (
                <li key={h} className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> {h}</li>
              ))}
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" /> Réservation sécurisée sur le site de {deal.partner}</li>
              <li className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-accent" /> Sélection du {dealsRefreshLabel()}, renouvelée chaque jour</li>
            </ul>

            <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-border bg-secondary/40 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-display text-3xl text-accent">{deal.price}</span>
                <p className="text-xs text-muted-foreground">par personne, selon disponibilités chez {deal.partner}</p>
              </div>
              <Button asChild size="lg" className="rounded-full gradient-hero text-primary-foreground shadow-glow">
                <a href={deal.url} target="_blank" rel="noopener noreferrer sponsored">
                  Réserver sur {deal.partner} <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              GlobeLink référence des offres publiques de partenaires. Les prix et disponibilités sont ceux affichés par {deal.partner} au moment de la réservation.
            </p>
          </div>
        </article>

        {others.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl"><Flame className="h-5 w-5 text-accent" /> Autres offres du jour</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {others.map((d) => (
                <Link key={d.slug} to="/deals/$slug" params={{ slug: d.slug }}
                  className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:shadow-elevated">
                  <div className="aspect-[16/10] overflow-hidden">
                    <img src={d.image} alt={d.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-accent">{d.price}</p>
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
