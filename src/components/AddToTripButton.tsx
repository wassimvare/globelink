import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Check, Loader2, MapPin, Notebook, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { trackProductEvent } from "@/lib/product-analytics";
import {
  buildTripDateRange,
  formatTripDayOption,
  tripEntryIdentity,
} from "@/features/travel/trip-journey";

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
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState("");

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
        .select("id,title,city,country,starts_on,ends_on,status,finalized_at")
        .eq("user_id", user!.id)
        .is("finalized_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) ?? null,
    [trips, selectedTripId],
  );
  const selectedTripDays = useMemo(
    () => buildTripDateRange(selectedTrip?.starts_on, selectedTrip?.ends_on),
    [selectedTrip?.starts_on, selectedTrip?.ends_on],
  );

  const openTrip = (tripId: string) =>
    navigate({ to: "/trips/$id", params: { id: tripId } });

  const closePicker = () => {
    setOpen(false);
    setSelectedTripId(null);
    setSelectedDay("");
  };

  const openPicker = () => {
    if (!user) {
      const redirect =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/trips";
      toast.info("Connecte-toi pour ajouter ce lieu à un voyage.");
      navigate({ to: "/auth", search: { redirect } });
      return;
    }
    setOpen(true);
  };

  const chooseTrip = (trip: (typeof trips)[number]) => {
    setSelectedTripId(trip.id);
    setSelectedDay("");
  };

  const addToTrip = async (trip: (typeof trips)[number]) => {
    if (!user || addingTripId) return;
    setAddingTripId(trip.id);
    try {
      const { data: candidates, error: existingError } = await supabase
        .from("trip_entries")
        .select("id,title,city,country")
        .eq("trip_id", trip.id)
        .eq("user_id", user.id)
        .limit(250);
      if (existingError) throw existingError;

      const identity = tripEntryIdentity(item);
      const existing = (candidates ?? []).find(
        (candidate) => tripEntryIdentity(candidate) === identity,
      );
      if (existing) {
        setAddedTripId(trip.id);
        closePicker();
        toast.message("Déjà ajouté à ce voyage", {
          description: "Tu peux ouvrir le carnet pour choisir ou modifier sa journée.",
          action: { label: "Ouvrir le voyage", onClick: () => openTrip(trip.id) },
        });
        return;
      }

      const sourceNote = [
        item.notes?.trim() || null,
        item.source ? `Source : ${item.source}` : null,
        item.sourceUrl ? `Lien : ${item.sourceUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const normalizedKind = normalizeKind(item.kind);
      const { error } = await supabase.from("trip_entries").insert({
        trip_id: trip.id,
        user_id: user.id,
        kind: normalizedKind,
        title: item.title.trim(),
        city: item.city || null,
        country: item.country || null,
        lat: Number.isFinite(item.lat) ? Number(item.lat) : null,
        lng: Number.isFinite(item.lng) ? Number(item.lng) : null,
        notes: sourceNote || null,
        rating: Number.isFinite(item.rating) ? Number(item.rating) : null,
        price_level: Number.isFinite(item.priceLevel)
          ? Math.max(1, Math.min(4, Math.round(Number(item.priceLevel))))
          : null,
        visited_on: selectedDay || null,
        position: Math.floor(Date.now() % 2_000_000_000),
      });
      if (error) throw error;

      void trackProductEvent("trip_item_added", {
        kind: normalizedKind,
        planned_day: selectedDay ? "dated" : "inbox",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trip-entries", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["trips", user.id] }),
      ]);
      setAddedTripId(trip.id);
      closePicker();
      toast.success(`Ajouté à ${trip.title}`, {
        description: selectedDay
          ? `Planifié le ${formatTripDayOption(selectedDay)}.`
          : "Ajouté dans « À organiser » pour le placer plus tard.",
        action: { label: "Ouvrir le voyage", onClick: () => openTrip(trip.id) },
      });
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

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setSelectedTripId(null);
            setSelectedDay("");
          }
        }}
      >
        <DialogContent className="max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-3xl sm:w-full">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {selectedTrip ? "Choisir la journée" : "Ajouter à quel voyage ?"}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
            <div className="font-semibold">{item.title}</div>
            {locationLabel && (
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {locationLabel}
              </div>
            )}
          </div>

          {selectedTrip ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedTripId(null);
                  setSelectedDay("");
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Changer de voyage
              </button>

              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Notebook className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{selectedTrip.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[selectedTrip.city, selectedTrip.country].filter(Boolean).join(", ") ||
                        "Voyage GlobeLink"}
                    </p>
                  </div>
                </div>
              </div>

              <label className="block space-y-2 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" /> Quand veux-tu le faire ?
                </span>
                <select
                  data-testid="add-to-trip-day"
                  value={selectedDay}
                  onChange={(event) => setSelectedDay(event.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base font-medium outline-none focus:border-primary/50"
                >
                  <option value="">À organiser plus tard</option>
                  {selectedTripDays.map((day) => (
                    <option key={day} value={day}>
                      {formatTripDayOption(day)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedTripDays.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  Ce voyage n’a pas encore de plage de dates. Le lieu sera conservé dans « À organiser ».
                </p>
              )}

              <Button
                type="button"
                data-testid="confirm-add-to-trip"
                className="h-12 w-full rounded-2xl"
                disabled={addingTripId === selectedTrip.id}
                onClick={() => void addToTrip(selectedTrip)}
              >
                {addingTripId === selectedTrip.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {selectedDay ? "Ajouter à cette journée" : "Ajouter à « À organiser »"}
              </Button>
            </div>
          ) : isLoading ? (
            <div className="grid min-h-32 place-items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Chargement de tes voyages…
            </div>
          ) : trips.length ? (
            <div className="max-h-[52dvh] space-y-2 overflow-y-auto pr-1">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => chooseTrip(trip)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/30 hover:bg-secondary/40"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Notebook className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{trip.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[trip.city, trip.country].filter(Boolean).join(", ") || "Voyage GlobeLink"}
                      {trip.starts_on
                        ? ` · ${new Date(`${trip.starts_on}T12:00:00`).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : ""}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-primary">Choisir</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <Notebook className="mx-auto h-7 w-7 text-primary" />
              <p className="mt-3 text-sm font-semibold">Tu n’as pas encore de voyage actif.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crée ton premier voyage puis reviens ajouter ce lieu.
              </p>
              <Button
                className="mt-4 rounded-full"
                onClick={() => {
                  closePicker();
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
