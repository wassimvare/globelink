import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlaceStatusForCurrentUser } from "@/lib/place-moderation.functions";
import { getSignedMediaUrl } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/place-status/$id")({
  head: () => ({ meta: [{ title: "Statut du lieu — GlobeLink" }] }),
  component: PlaceStatusPage,
});

type PlaceStatus = "pending" | "ai_flagged" | "approved" | "rejected";

type PlaceRow = {
  id: string;
  name: string;
  category: string;
  country: string;
  city: string | null;
  description: string | null;
  image_url: string | null;
  lat: number;
  lng: number;
  created_at: string;
  moderation_status: PlaceStatus;
  moderation_reviewed_at: string | null;
  moderation_rejection_reason: string | null;
};

const STATUS_CONFIG: Record<
  PlaceStatus,
  {
    label: string;
    title: string;
    description: string;
    badge: string;
    icon: typeof Clock3;
  }
> = {
  pending: {
    label: "En attente",
    title: "En attente de validation admin",
    description:
      "Ton lieu est enregistré, mais il reste invisible sur la carte jusqu'à validation.",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    icon: Clock3,
  },
  ai_flagged: {
    label: "En attente",
    title: "En attente de validation admin",
    description:
      "Ton lieu est enregistré, mais il reste invisible sur la carte jusqu'à validation.",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    icon: Clock3,
  },
  approved: {
    label: "Validé",
    title: "Validé — visible sur la carte",
    description: "Ton lieu est maintenant publié et visible par la communauté.",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Refusé",
    title: "Refusé par l'administration",
    description: "Ton lieu n'est pas publié sur la carte.",
    badge: "bg-red-500/15 text-red-700 dark:text-red-300",
    icon: XCircle,
  },
};

function PlaceStatusPage() {
  const { id } = Route.useParams();
  const getPlaceStatus = useServerFn(getPlaceStatusForCurrentUser);
  const previousStatus = useRef<PlaceStatus | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["place-status", id],
    queryFn: async () => {
      const place = await getPlaceStatus({ data: { id } });
      const row = place as PlaceRow | null;
      const imageUrl = row?.image_url ? await getSignedMediaUrl(row.image_url) : null;
      return { place: row, imageUrl };
    },
    refetchInterval: (query) => {
      const currentStatus = (query.state.data as { place: PlaceRow | null } | undefined)?.place
        ?.moderation_status;
      return currentStatus === "approved" || currentStatus === "rejected" ? false : 15_000;
    },
  });

  const place = data?.place ?? null;
  const status = place?.moderation_status ?? "pending";
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const mapsUrl = place ? `https://www.google.com/maps?q=${place.lat},${place.lng}` : "";

  useEffect(() => {
    if (!place?.moderation_status) return;
    if (!previousStatus.current) {
      previousStatus.current = place.moderation_status;
      return;
    }
    if (previousStatus.current !== place.moderation_status) {
      previousStatus.current = place.moderation_status;
      if (place.moderation_status === "approved") toast.success("Ton lieu a été validé.");
      if (place.moderation_status === "rejected") toast.error("Ton lieu a été refusé.");
    }
  }, [place?.moderation_status]);

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement du statut…</p>
          ) : error ? (
            <div className="space-y-3">
              <h1 className="font-display text-2xl">Impossible de charger ce lieu</h1>
              <p className="text-sm text-muted-foreground">
                Vérifie que tu es connecté avec le compte qui a créé ce lieu.
              </p>
              <Button asChild variant="outline">
                <Link to="/dashboard">Retour au tableau de bord</Link>
              </Button>
            </div>
          ) : !place ? (
            <div className="space-y-3">
              <h1 className="font-display text-2xl">Lieu introuvable</h1>
              <p className="text-sm text-muted-foreground">
                Le lieu n'existe pas ou tu n'as pas l'autorisation de le voir.
              </p>
              <Button asChild variant="outline">
                <Link to="/new-place">Ajouter un autre lieu</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="grid h-28 w-full place-items-center overflow-hidden rounded-2xl bg-secondary sm:w-32">
                  {data?.imageUrl ? (
                    <img
                      src={data.imageUrl}
                      alt={place.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <MapPin className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Badge className={config.badge}>
                    <StatusIcon className="mr-1 h-3.5 w-3.5" />
                    {config.label}
                  </Badge>
                  <h1 className="mt-3 font-display text-3xl">{place.name}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[place.city, place.country].filter(Boolean).join(", ")} · {place.category}
                  </p>
                </div>
              </div>

              <section className="mt-5 rounded-2xl border border-border bg-background/60 p-4">
                <h2 className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {config.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{config.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Cette page vérifie automatiquement le statut toutes les 15 secondes. Tu recevras
                  aussi une notification quand l'admin valide ou refuse le lieu.
                </p>
              </section>

              <section className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
                <h2 className="font-semibold">Suivi de ta proposition</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Les contrôles internes et la décision détaillée sont réservés à l'équipe de
                  modération. Tu verras ici uniquement la décision finale et tu recevras une
                  notification dès qu'elle sera prise.
                </p>
                {place.moderation_rejection_reason && (
                  <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                    Motif du refus : {place.moderation_rejection_reason}
                  </p>
                )}
              </section>

              {place.description && (
                <section className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
                  <h2 className="font-semibold">Description envoyée</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {place.description}
                  </p>
                </section>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {status === "approved" && (
                  <Button asChild>
                    <Link to="/map">
                      <MapPin className="mr-1 h-4 w-4" />
                      Voir la carte
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline">
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Vérifier sur Maps
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/notifications">
                    <Bell className="mr-1 h-4 w-4" />
                    Notifications
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/new-place">Ajouter un autre lieu</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
