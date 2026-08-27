import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MapPin, Notebook, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type AddToTripItem = {
  title: string;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  kind?: string | null;
  rating?: number | null;
  priceLevel?: number | null;
  source?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
};

type Props = {
  item: AddToTripItem;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  label?: string;
  compact?: boolean;
};

function normalizeKind(value?: string | null) {
  const kind = String(value ?? "stop").toLowerCase();
  if (kind.includes("hotel") || kind.includes("hébergement")) return "hotel";
  if (kind.includes("restaurant") || kind.includes("food")) return "restaurant";
  if (kind.includes("activity") || kind.includes("activité")) return "activity";
  if (kind.includes("transport")) return "transport";
  return "stop";
}

export function AddToTripButton({
  item,
  className,
  size = "default",
  variant = "outline",
  label = "Ajouter à mon voyage",
  compact = false,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addingTripId, setAddingTripId] = useState<string | null>(null);
  const [addedTripId, setAddedTripId] = useState<string | null>(null);

  const locationLabel = useMemo(
    () => [item.city, item.country].filter(Boolean).join(", "),
    [item.city, item.country],
  );

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["add-to-trip-picker", user?.id],
    enabled: !!user && open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id,title,city,country,starts_on,ends_on,status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const openPicker = () => {
    if (!user) {
      const redirect = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/trips";
      toast.info("Connecte-toi pour ajouter ce lieu à un voyage.");
      navigate({ to: "/auth", search: { redirect } });
      return;
    }
    setOpen(true);
  };

  const addToTrip = async (trip: (typeof trips)[number]) => {
    if (!user || addingTripId) return;
    setAddingTripId(trip.id);
    try {
      const { data: existing, error: existingError } = await supabase
        .from("trip_entries")
        .select("id")
        .eq("trip_id", trip.id)
        .eq("title", item.title)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        setAddedTripId(trip.id);
        setOpen(false);
        toast.message("Déjà ajouté à ce voyage");
        return;
      }

      const sourceNote = [
        item.notes?.trim() || null,
        item.source ? `Source : ${item.source}` : null,
        item.sourceUrl ? `Lien : ${item.sourceUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const { error } = await supabase.from("trip_entries").insert({
        trip_id: trip.id,
        user_id: user.id,
        kind: normalizeKind(item.kind),
        title: item.title,
        city: item.city || null,
        country: item.country || null,
        lat: Number.isFinite(item.lat) ? Number(item.lat) : null,
        lng: Number.isFinite(item.lng) ? Number(item.lng) : null,
        notes: sourceNote || null,
        rating: Number.isFinite(item.rating) ? Number(item.rating) : null,
        price_level: Number.isFinite(item.priceLevel)
          ? Math.max(1, Math.min(4, Math.round(Number(item.priceLevel))))
          : null,
        visited_on: trip.starts_on || null,
        position: Math.floor(Date.now() % 2_000_000_000),
      });
      if (error) throw error;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trip-entries", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["trips", user.id] }),
      ]);
      setAddedTripId(trip.id);
      setOpen(false);
      toast.success(`Ajouté à ${trip.title}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Impossible d’ajouter cet élément au voyage.");
    } finally {
      setAddingTripId(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={addedTripId ? "default" : variant}
        size={size}
        className={className}
        onClick={openPicker}
      >
        {addedTripId ? <Check className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
        {compact ? (addedTripId ? "Ajouté" : "Voyage") : addedTripId ? "Ajouté au voyage" : label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-3xl sm:w-full">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Ajouter à quel voyage ?</DialogTitle>
          </DialogHeader>

          <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
            <div className="font-semibold">{item.title}</div>
            {locationLabel && (
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {locationLabel}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="grid min-h-32 place-items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Chargement de tes voyages…
            </div>
          ) : trips.length ? (
            <div className="max-h-[52dvh] space-y-2 overflow-y-auto pr-1">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => void addToTrip(trip)}
                  disabled={!!addingTripId}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/30 hover:bg-secondary/40 disabled:opacity-60"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Notebook className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{trip.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[trip.city, trip.country].filter(Boolean).join(", ") || "Voyage GlobeLink"}
                      {trip.starts_on ? ` · ${new Date(`${trip.starts_on}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}
                    </span>
                  </span>
                  {addingTripId === trip.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <Notebook className="mx-auto h-7 w-7 text-primary" />
              <p className="mt-3 text-sm font-semibold">Tu n’as pas encore de voyage.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crée ton premier voyage puis reviens ajouter ce lieu.
              </p>
              <Button
                className="mt-4 rounded-full"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/trips" });
                }}
              >
                Créer un voyage
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
