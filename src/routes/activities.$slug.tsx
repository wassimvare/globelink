import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, ShieldCheck, Sparkles, Star, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { COUNTRY_INFO } from "@/lib/country-info";
import { POPULAR_ACTIVITIES, slugify } from "@/lib/mock-home";

type ActivityDetail = {
  slug: string;
  title: string;
  place: string;
  image: string;
  rating: number;
  price: string;
  duration: string;
  description: string;
  highlights: string[];
  country?: string;
};

function getActivity(slug: string): ActivityDetail | null {
  const featured = POPULAR_ACTIVITIES.find((activity) => activity.slug === slug);
  if (featured) {
    return {
      ...featured,
      highlights: ["Sélectionnée par la communauté", "Guide local recommandé", "Compatible carnet de voyage"],
    };
  }

  for (const country of COUNTRY_INFO) {
    const title = country.activities.find((activity) => slugify(activity) === slug);
    if (!title) continue;
    return {
      slug,
      title,
      place: country.name,
      image: country.cover,
      rating: 4.7,
      price: country.costPerDay,
      duration: "À organiser sur place",
      country: country.name,
      description: `${title} fait partie des expériences les plus recommandées par les voyageurs GlobeLink en ${country.name}. Consulte les conseils de la communauté, compare le budget moyen et ajoute cette idée à ton prochain itinéraire.`,
      highlights: [country.bestTime, `Budget moyen : ${country.costPerDay}`, `Sécurité : ${country.safety}`],
    };
  }
  return null;
}

export const Route = createFileRoute("/activities/$slug")({
  loader: ({ params }): { activity: ActivityDetail } => {
    const activity = getActivity(params.slug);
    if (!activity) throw notFound();
    return { activity };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Activité indisponible — GlobeLink" }, { name: "robots", content: "noindex" }] };
    }
    const { activity } = loaderData;
    const description = activity.description.slice(0, 155);
    return {
      meta: [
        { title: `${activity.title} — GlobeLink` },
        { name: "description", content: description },
        { property: "og:title", content: `${activity.title} — GlobeLink` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:image", content: activity.image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: activity.image },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl">Activité indisponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cette activité n'est plus dans la sélection GlobeLink.</p>
        <Button asChild className="mt-6 rounded-full gradient-hero text-primary-foreground">
          <Link to="/">Retour au fil</Link>
        </Button>
      </main>
    </div>
  ),
  component: ActivityPage,
});

function ActivityPage() {
  const { activity } = Route.useLoaderData();
  const related = POPULAR_ACTIVITIES.filter((item) => item.slug !== activity.slug).slice(0, 3);
  const bookingUrl = `https://www.google.com/search?q=${encodeURIComponent(`${activity.title} ${activity.place} réservation`)}`;

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link to="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour au fil
        </Link>

        <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="relative min-h-[360px] overflow-hidden sm:min-h-[460px]">
            <img src={activity.image} alt={activity.title} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full glass px-3 py-1 text-xs font-semibold text-white"><Star className="h-3.5 w-3.5 fill-accent text-accent" /> {activity.rating.toFixed(1)}</span>
                <span className="rounded-full glass px-3 py-1 text-xs font-semibold text-white">{activity.duration}</span>
              </div>
              <h1 className="max-w-3xl font-display text-4xl leading-tight sm:text-5xl">{activity.title}</h1>
              <p className="mt-3 flex items-center gap-2 text-sm text-white/90"><MapPin className="h-4 w-4" /> {activity.place}</p>
            </div>
          </div>

          <div className="grid gap-8 p-6 lg:grid-cols-[1fr_320px] lg:p-8">
            <div>
              <p className="text-base leading-relaxed text-foreground/90">{activity.description}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <InfoPill icon={<CalendarDays className="h-4 w-4" />} label="Durée" value={activity.duration} />
                <InfoPill icon={<Users className="h-4 w-4" />} label="Communauté" value="Recommandée" />
                <InfoPill icon={<ShieldCheck className="h-4 w-4" />} label="Confiance" value="Conseils vérifiés" />
              </div>

              <section className="mt-8">
                <h2 className="font-display text-2xl">À savoir avant de réserver</h2>
                <ul className="mt-4 space-y-3 text-sm text-foreground/85">
                  {activity.highlights.map((highlight: string) => (
                    <li key={highlight} className="flex gap-3 rounded-2xl border border-border bg-secondary/40 p-3">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <aside className="rounded-3xl border border-border bg-secondary/40 p-5 lg:sticky lg:top-24 lg:self-start">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">À partir de</p>
              <p className="mt-1 font-display text-4xl text-accent">{activity.price}</p>
              <p className="mt-2 text-sm text-muted-foreground">Compare les disponibilités et ajoute l'activité à ton itinéraire GlobeLink.</p>
              <Button asChild size="lg" className="mt-5 w-full rounded-full gradient-hero text-primary-foreground shadow-glow">
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer sponsored">
                  Réserver cette activité <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
              {activity.country && (
                <Button asChild variant="outline" className="mt-3 w-full rounded-full">
                  <Link to="/ai-trip" search={{ destination: activity.country }}>Créer mon voyage</Link>
                </Button>
              )}
            </aside>
          </div>
        </article>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 font-display text-2xl">Autres activités populaires</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((item) => (
                <Link key={item.slug} to="/activities/$slug" params={{ slug: item.slug }} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:shadow-elevated">
                  <div className="aspect-[16/10] overflow-hidden">
                    <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  </div>
                  <div className="p-4">
                    <p className="font-semibold leading-snug">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.place} · ★ {item.rating}</p>
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

function InfoPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}