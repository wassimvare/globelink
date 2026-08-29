import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, MapPin, Star } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  catalogOfficialWebsite,
  catalogSourceLabel,
  reservationLabel,
  reservationUrl,
  type LiveCatalogItem,
} from "@/lib/live-catalog";
import { CatalogImage } from "@/components/CatalogImage";
import { AddToTripButton } from "@/components/AddToTripButton";
import { AIContextActions } from "@/components/AIContextActions";
// AI_CONTEXT_LAYER_V1_ACTIVITY
// ADD_TO_TRIP_EVERYWHERE_V1_ACTIVITY
import { getSignedMediaUrl } from "@/lib/storage";
import { isTrustedVisibleCatalogItem } from "@/lib/catalog-source-routing";
import { curatedActivityBySlug } from "@/lib/world-activities";

export const Route = createFileRoute("/activities/$slug")({
  head: () => ({ meta: [{ title: "Lieu recommandé — GlobeLink" }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const { slug } = Route.useParams();
  const decodedName = decodeURIComponent(slug).replace(/-/g, " ");
  const { data: place, isLoading } = useQuery({
    queryKey: ["activity-place", slug],
    queryFn: async () => {
      const { data: external, error: extError } = await (supabase as any)
        .from("external_catalog_items")
        .select(
          "id,title,slug,kind,category,city,country,description,latitude,longitude,image_url,source_url,booking_url,provider,rating,fetched_at,tags",
        )
        .eq("slug", slug)
        .eq("published", true)
        .eq("admin_hidden", false)
        .maybeSingle();
      if (!extError && external) {
        return isTrustedVisibleCatalogItem(external)
          ? { ...external, name: external.title, isExternal: true }
          : null;
      }

      const curated = curatedActivityBySlug(slug);
      if (curated && isTrustedVisibleCatalogItem(curated)) {
        return { ...curated, name: curated.title, isExternal: true };
      }

      const { data, error } = await supabase
        .from("places")
        .select("id, name, category, city, country, description, image_url, lat, lng")
        .eq("moderation_status", "approved")
        .ilike("name", decodedName)
        .maybeSingle();
      if (!error && data) {
        return {
          ...data,
          latitude: data.lat,
          longitude: data.lng,
          image_url: data.image_url ? await getSignedMediaUrl(data.image_url) : null,
          isExternal: false,
        };
      }

      if (error) throw error;
      return null;
    },
  });

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        <Link
          to="/map"
          className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à la carte
        </Link>
        {isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : !place ? (
          <section className="rounded-3xl border border-dashed border-border p-10 text-center">
            <h1 className="font-display text-2xl">Lieu introuvable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ce lieu n’est plus disponible ou a été retiré par l’administration.
            </p>
            <Button asChild className="mt-5 rounded-full">
              <Link to="/map">Explorer la carte</Link>
            </Button>
          </section>
        ) : (
          <article className="overflow-hidden rounded-2xl border border-border bg-card sm:rounded-3xl">
            <div className="relative aspect-[16/10] overflow-hidden bg-secondary sm:aspect-[16/8]">
              <CatalogImage
                item={{
                  id: place.id || slug,
                  kind: (place.kind || "activity") as LiveCatalogItem["kind"],
                  title: place.name,
                  image_url: place.image_url || null,
                  tags: place.tags || null,
                }}
                lookup={{
                  latitude: place.latitude ?? null,
                  longitude: place.longitude ?? null,
                  city: place.city ?? null,
                  country: place.country ?? null,
                  website: catalogOfficialWebsite({
                    booking_url: place.booking_url ?? null,
                    tags: place.tags ?? null,
                  }),
                }}
                priority
                showAttribution
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-5 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {place.category || place.kind}
              </p>
              <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">{place.name}</h1>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />{" "}
                {[place.city, place.country].filter(Boolean).join(", ")}
              </p>
              {place.rating != null && (
                <p className="mt-2 flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />{" "}
                  {Number(place.rating).toFixed(1)}
                </p>
              )}
              <AddToTripButton
                item={{
                  title: place.name,
                  city: place.city ?? null,
                  country: place.country ?? null,
                  lat: place.latitude ?? null,
                  lng: place.longitude ?? null,
                  kind: place.kind || place.category || "activity",
                  rating: place.rating != null ? Number(place.rating) : null,
                  source: place.isExternal ? place.provider || "Source partenaire" : "GlobeLink",
                  sourceUrl: place.source_url ?? null,
                }}
                variant="default"
                className="mt-5 w-full rounded-full sm:w-auto"
              />
              <AIContextActions
                destination={[place.city, place.country].filter(Boolean).join(", ")}
                freePrompt={`Que dois-je savoir sur ${place.name} à ${[place.city, place.country].filter(Boolean).join(", ") || "cette destination"} ? Donne-moi des conseils rapides et pratiques.`}
                proPrompt={String(place.kind || place.category).toLowerCase().includes("hotel")
                  ? `Compare ${place.name} aux meilleures alternatives proches pour mon voyage : prix, emplacement, avantages, limites et verdict.`
                  : `Recherche et vérifie ${place.name} pour mon voyage : intérêt, horaires ou conditions à confirmer, prix indicatifs, alternatives proches et recommandation finale.`}
                proMode={String(place.kind || place.category).toLowerCase().includes("hotel") ? "compare" : "research"}
                proLabel={String(place.kind || place.category).toLowerCase().includes("hotel") ? "Comparer avec IA+" : "Vérifier avec IA+"}
                className="mt-3"
              />
              {place.description ? (
                <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                  {place.description}
                </p>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">
                  Aucune description n’a encore été fournie.
                </p>
              )}
              {place.isExternal && (
                <div className="mt-6 rounded-2xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
                  Source :{" "}
                  {catalogSourceLabel({
                    kind: (place.kind || "activity") as LiveCatalogItem["kind"],
                    title: place.name,
                    city: place.city ?? null,
                    country: place.country ?? null,
                    provider: place.provider ?? "globelink-curated",
                    tags: place.tags ?? null,
                  })}
                  . Vérifie les informations avant de te déplacer.
                  <Button asChild variant="outline" className="mt-3 w-full rounded-full sm:w-auto">
                    <a href={reservationUrl(place)} target="_blank" rel="noopener noreferrer">
                      {reservationLabel(place)} <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
