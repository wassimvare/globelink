import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, ArrowRight, RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { dealsOfTheDay, dealsRefreshLabel } from "@/lib/deals";

export const Route = createFileRoute("/deals/")({
  head: () => ({
    meta: [
      { title: "Offres du moment — GlobeLink" },
      { name: "description", content: "Vols, séjours, hôtels et activités sélectionnés chaque jour par GlobeLink, réservables directement chez nos partenaires." },
      { property: "og:title", content: "Offres du moment — GlobeLink" },
      { property: "og:description", content: "Une sélection d'offres voyage renouvelée automatiquement chaque jour." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DealsPage,
});

function DealsPage() {
  const deals = dealsOfTheDay();

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl gradient-sunset text-white shadow-soft">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-3xl">Offres du moment</h1>
              <p className="text-sm text-muted-foreground">
                Sélection réelle chez nos partenaires — réservation directe.
              </p>
            </div>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 text-accent" /> Renouvelée automatiquement — mise à jour du {dealsRefreshLabel()}
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-3">
          {deals.map((d, i) => (
            <Link
              key={d.slug}
              to="/deals/$slug"
              params={{ slug: d.slug }}
              style={{ animationDelay: `${i * 50}ms` }}
              className="animate-rise group overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:shadow-elevated"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <img src={d.image} alt={d.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <span className="absolute left-3 top-3 rounded-full gradient-sunset px-2.5 py-1 text-xs font-semibold text-white shadow-soft">{d.badge}</span>
                <span className="absolute right-3 top-3 rounded-full glass px-2.5 py-1 text-xs font-medium text-white">{d.category}</span>
              </div>
              <div className="p-5">
                <h2 className="font-display text-lg">{d.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{d.destination} · {d.partner}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-display text-2xl text-accent">{d.price}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium">
                    Voir l'offre <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
