import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Compass, MapPin, Search } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { DestinationImage } from "@/components/DestinationImage";
import { supabase } from "@/integrations/supabase/client";
import { COUNTRY_INFO } from "@/lib/country-info";
import { verifiedDestinationCover } from "@/lib/destination-cover";
import {
  fetchVerifiedDestinationCovers,
  type DestinationCoverMedia,
} from "@/lib/destination-media.functions";
import { WORLD_MAP_HUBS } from "@/lib/world-map-hubs";
import { slugifyDestination } from "@/lib/phase2";

export const Route = createFileRoute("/destinations/")({
  head: () => ({ meta: [{ title: "Destinations — GlobeLink" }] }),
  component: DestinationsExplorerPage,
});

type ExplorerDestination = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string;
  cover_url: string | null;
  summary: string | null;
};

function DestinationsExplorerPage() {
  const [query, setQuery] = useState("");
  const { data: databaseDestinations = [] } = useQuery({
    queryKey: ["phase2-destinations-explorer-v2"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("destinations")
          .select("id,name,slug,city,country,cover_url,summary")
          .limit(60);
        if (error) return [];
        return (data ?? []) as ExplorerDestination[];
      } catch {
        return [];
      }
    },
    staleTime: 10 * 60_000,
    retry: false,
  });

  const destinations = useMemo(() => {
    const values = new Map<
      string,
      {
        slug: string;
        title: string;
        subtitle: string;
        country: string;
        cover: string | null;
        summary: string;
        emoji?: string;
      }
    >();

    for (const info of COUNTRY_INFO) {
      const countrySlug = slugifyDestination(info.name);
      values.set(countrySlug, {
        slug: countrySlug,
        title: info.name,
        subtitle: (info.tags ?? []).slice(0, 3).join(" · "),
        country: info.name,
        // Historical COUNTRY_INFO images are Unsplash illustrations. They are not
        // presented as verified photos of the country on the Destinations page.
        cover: null,
        summary: info.intro || `Découvre ${info.name} avec GlobeLink.`,
        emoji: info.emoji,
      });
    }

    // Ajoute aussi tous les pays couverts par la carte mondiale, même s'ils
    // n'ont pas encore de ligne dédiée dans la table `destinations`.
    for (const hub of WORLD_MAP_HUBS) {
      const countrySlug = slugifyDestination(hub.country);
      if (values.has(countrySlug)) continue;
      values.set(countrySlug, {
        slug: countrySlug,
        title: hub.country,
        subtitle: `Explorer depuis ${hub.city}`,
        country: hub.country,
        // Never fabricate a country photo. A clean geographic placeholder is
        // preferable to showing the same unrelated landscape for several countries.
        cover: null,
        summary: `Restaurants, hôtels, activités et voyageurs autour de ${hub.city}.`,
        emoji: "🌍",
      });
    }

    for (const item of databaseDestinations) {
      if (!item?.slug || !item?.name || !item?.country) continue;
      const countryFallback = values.get(slugifyDestination(item.country));
      values.set(item.slug, {
        slug: item.slug,
        title: item.name,
        subtitle: [item.city, item.country].filter(Boolean).join(", "),
        country: item.country,
        cover: verifiedDestinationCover(item.cover_url) || countryFallback?.cover || null,
        summary: item.summary || `Découvre ${item.name} avec GlobeLink.`,
      });
    }

    const needle = query.trim().toLowerCase();
    return [...values.values()].filter((item) => {
      if (!needle) return true;
      return `${item.title} ${item.subtitle} ${item.summary}`.toLowerCase().includes(needle);
    });
  }, [databaseDestinations, query]);

  const coverTitles = useMemo(
    () => Array.from(new Set(destinations.map((item) => item.title))),
    [destinations],
  );
  const { data: verifiedCovers = [] } = useQuery({
    queryKey: ["phase2-destination-landmark-covers-v2", coverTitles.join("|")],
    enabled: coverTitles.length > 0,
    queryFn: () =>
      fetchVerifiedDestinationCovers({ data: { titles: coverTitles } }) as Promise<
        DestinationCoverMedia[]
      >,
    staleTime: 24 * 60 * 60_000,
    gcTime: 48 * 60 * 60_000,
    retry: false,
  });
  const coverByTitle = useMemo(
    () => new Map(verifiedCovers.map((cover) => [cover.title.toLowerCase(), cover])),
    [verifiedCovers],
  );

  return (
    <div className="app-page pb-24">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-9">
        <section className="mb-7 overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
                <Compass className="h-4 w-4" /> Explorer GlobeLink
              </div>
              <h1 className="font-display text-3xl font-semibold sm:text-4xl">Destinations</h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Retrouve les lieux, activités, hôtels, restaurants, voyageurs et publications de
                chaque destination.
              </p>
            </div>
            <label className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher Bali, Tunisie, Japon…"
                className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary/50"
              />
            </label>
          </div>
        </section>

        {destinations.length ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {destinations.map((item) => {
              const resolvedCover = coverByTitle.get(item.title.toLowerCase()) ?? null;
              return (
                <Link
                  key={item.slug}
                  to="/destinations/$slug"
                  params={{ slug: item.slug }}
                  className="group overflow-hidden rounded-[1.6rem] border border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  <div className="relative aspect-[16/11] overflow-hidden bg-secondary">
                    <DestinationImage
                      title={item.title}
                      country={item.country}
                      storedUrl={item.cover}
                      resolvedMedia={resolvedCover}
                      resolve={false}
                      emoji={item.emoji}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                      <h2 className="font-display text-xl font-semibold">
                        {item.emoji ? `${item.emoji} ` : ""}
                        {item.title}
                      </h2>
                      <p className="mt-1 line-clamp-1 text-xs text-white/80">{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
                    <div className="mt-3 flex items-center justify-between text-xs font-semibold text-primary">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> Ouvrir
                      </span>
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Aucune destination ne correspond à ta recherche.
          </div>
        )}
      </main>
    </div>
  );
}
