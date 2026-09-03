import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, MapPin, Search, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CatalogImage } from "@/components/CatalogImage";
import {
  catalogOfficialWebsite,
  catalogSourceLabel,
  fetchLiveCatalog,
  itemLocation,
  type LiveCatalogItem,
} from "@/lib/live-catalog";
import { dailyWorldActivitySelection } from "@/lib/world-activities";

export const Route = createFileRoute("/activities/")({
  head: () => ({
    meta: [
      { title: "Activités dans le monde — GlobeLink" },
      {
        name: "description",
        content:
          "Activités et lieux emblématiques dans tous les pays couverts par GlobeLink, avec photos et sources vérifiables.",
      },
    ],
  }),
  component: ActivitiesExplorerPage,
});

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
}

function ActivitiesExplorerPage() {
  const [query, setQuery] = useState("");
  const instantActivities = useMemo(() => dailyWorldActivitySelection(24), []);
  const {
    data: activities = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["live-catalog", "trusted-activities-page"],
    queryFn: () => fetchLiveCatalog({ kinds: ["activity"], limit: 240 }),
    initialData: instantActivities,
    initialDataUpdatedAt: 0,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
  const visibleActivities = useMemo(() => {
    const needle = normalize(query.trim());
    return activities
      .filter((activity) => {
        if (!needle) return true;
        return normalize(
          [
            activity.title,
            activity.country,
            activity.city,
            activity.category,
            catalogSourceLabel(activity),
          ].join(" "),
        ).includes(needle);
      })
      .sort(
        (a, b) =>
          (a.country ?? "").localeCompare(b.country ?? "", "fr") ||
          a.title.localeCompare(b.title, "fr"),
      );
  }, [activities, query]);
  const countryCount = useMemo(
    () =>
      new Set(activities.map((activity) => normalize(activity.country ?? "")).filter(Boolean)).size,
    [activities],
  );

  return (
    <div className="app-page pb-24">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-9">
        <section className="mb-7 overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary">
                <Sparkles className="h-4 w-4" /> Couverture mondiale
              </div>
              <h1 className="font-display text-3xl font-semibold sm:text-4xl">
                Activités dans tous les pays
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                Lieux et activités réels issus de sources vérifiables. Google Places et Ticketmaster
                restent prioritaires quand ils sont disponibles. Aucune image générique n’est utilisée
                comme photo de lieu.
              </p>
              <p className="mt-2 text-xs font-semibold text-primary">
                {activities.length} activité{activities.length > 1 ? "s" : ""} · {countryCount} pays
                {isFetching ? " · actualisation…" : ""}
              </p>
            </div>
            <label className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Pays, ville ou activité…"
                className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary/50"
              />
            </label>
          </div>
        </section>

        {isLoading && activities.length === 0 ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton h-44 rounded-[1.6rem]" />
            ))}
          </section>
        ) : visibleActivities.length ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleActivities.map((activity, index) => {
              const country = activity.country ?? "Destination";
              return (
                <article
                  key={activity.id}
                  className="overflow-hidden rounded-[1.6rem] border border-border bg-card shadow-soft"
                >
                  <Link
                    to="/activities/$slug"
                    params={{ slug: activity.slug }}
                    className="group block"
                  >
                    <div className="relative aspect-[16/11] overflow-hidden bg-secondary">
                      <CatalogImage
                        item={activity as LiveCatalogItem}
                        fallbackIndex={index}
                        priority={index < 2}
                        lookup={{
                          latitude: activity.latitude,
                          longitude: activity.longitude,
                          city: activity.city,
                          country: activity.country,
                          website: catalogOfficialWebsite(activity),
                        }}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/75">
                          {catalogSourceLabel(activity)}
                        </p>
                        <h2 className="mt-1 font-display text-xl font-semibold leading-tight">
                          {activity.title}
                        </h2>
                        <p className="mt-1 flex items-center gap-1 text-xs text-white/80">
                          <MapPin className="h-3.5 w-3.5" /> {activity.city}, {country}
                        </p>
                      </div>
                    </div>
                  </Link>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground">
                        <Camera className="h-3.5 w-3.5 text-primary" /> Photo exacte quand
                        disponible
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {itemLocation(activity) || country}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Aucune activité vérifiable ne correspond à ta recherche pour le moment.
          </div>
        )}
      </main>
    </div>
  );
}
