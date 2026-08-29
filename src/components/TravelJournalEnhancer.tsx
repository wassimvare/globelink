import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bed,
  Bus,
  Camera,
  ImagePlus,
  Loader2,
  MapPin,
  PenLine,
  Play,
  Trash2,
  UtensilsCrossed,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  getSignedMediaUrl,
  getVideoMetadata,
  uploadMedia,
  validateMediaFile,
} from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX_FILES = 8;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 120;

type MemoryKind = "memory" | "activity" | "restaurant" | "hotel" | "transport" | "stop";
type DaySlot = { day: string; element: HTMLElement };

const MEMORY_KINDS: Array<{ value: MemoryKind; label: string; icon: typeof Camera }> = [
  { value: "memory", label: "Souvenir", icon: Camera },
  { value: "activity", label: "Activité", icon: Activity },
  { value: "restaurant", label: "Restaurant", icon: UtensilsCrossed },
  { value: "hotel", label: "Hébergement", icon: Bed },
  { value: "transport", label: "Transport", icon: Bus },
  { value: "stop", label: "Lieu / étape", icon: MapPin },
];

function tripIdFromPath(pathname: string) {
  const match = pathname.match(/\/trips\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function mediaPaths(entry: any) {
  const values = [
    ...(Array.isArray(entry?.media_urls) ? entry.media_urls : []),
    entry?.image_url,
    entry?.video_url,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return Array.from(new Set(values));
}

function isVideoPath(path: string) {
  return /\.(mp4|webm|mov)(?:$|\?)/i.test(path);
}

function dayLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function MemoryMedia({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSignedMediaUrl(path).then((next) => active && setUrl(next));
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) {
    return (
      <div className="grid aspect-square place-items-center rounded-xl bg-muted/50">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (isVideoPath(path)) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video src={url} controls playsInline preload="metadata" className="aspect-square h-full w-full object-cover" />
        <span className="pointer-events-none absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white">
          <Play className="h-3.5 w-3.5 fill-current" />
        </span>
      </div>
    );
  }

  return <img src={url} alt="Souvenir de voyage" className="aspect-square h-full w-full rounded-xl object-cover" />;
}

function MemoryGallery({ day, tripId, entries }: { day: string; tripId: string; entries: any[] }) {
  const qc = useQueryClient();
  const memories = entries.filter(
    (entry) =>
      entry.visited_on === day &&
      (entry.kind === "photo" || mediaPaths(entry).length > 0) &&
      !/^IA\+\s*·\s*Jour/i.test(String(entry.title ?? "")),
  );

  if (!memories.length) return null;

  return (
    <section className="mx-4 mb-4 rounded-[1.75rem] border border-border/70 bg-background/45 p-4 sm:mx-6 sm:mb-6 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Camera className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="font-display text-lg font-bold">Souvenirs de la journée</h3>
          <p className="text-xs text-muted-foreground">Photos, vidéos et moments racontés.</p>
        </div>
      </div>

      <div className="space-y-4">
        {memories.map((entry) => {
          const paths = mediaPaths(entry);
          return (
            <div key={entry.id} className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-3 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold sm:text-base">{entry.title}</p>
                  {(entry.city || entry.country) && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {[entry.city, entry.country].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Supprimer ce souvenir"
                  onClick={async () => {
                    if (!window.confirm("Supprimer ce souvenir et ses médias ?")) return;
                    try {
                      if (paths.length) await supabase.storage.from("media").remove(paths);
                      const { error } = await supabase
                        .from("trip_entries")
                        .delete()
                        .eq("id", entry.id)
                        .eq("trip_id", tripId);
                      if (error) throw error;
                      await qc.invalidateQueries({ queryKey: ["trip-entries", tripId] });
                      toast.success("Souvenir supprimé");
                    } catch (error: any) {
                      toast.error(error?.message ?? "Impossible de supprimer ce souvenir.");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {entry.notes && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">{entry.notes}</p>
              )}

              {paths.length > 0 && (
                <div className={`mt-3 grid gap-2 ${paths.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {paths.map((path) => <MemoryMedia key={path} path={path} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// journal-memory-geocode-fix
async function geocodeMemoryLocation(city?: string | null, country?: string | null) {
  const rawCity = String(city ?? "").trim();
  const query = rawCity.split(",")[0]?.trim() || String(country ?? "").trim();
  if (!query) return null;
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=fr&format=json`,
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: Array<{ latitude: number; longitude: number; country?: string }>;
    };
    const requestedCountry = String(country ?? "").trim().toLocaleLowerCase("fr");
    const result =
      payload.results?.find((item) =>
        requestedCountry ? String(item.country ?? "").toLocaleLowerCase("fr").includes(requestedCountry) : true,
      ) ?? payload.results?.[0];
    if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;
    return { lat: Number(result.latitude), lng: Number(result.longitude) };
  } catch {
    return null;
  }
}

function MemoryComposer({
  open,
  onOpenChange,
  tripId,
  userId,
  day,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  userId: string;
  day: string | null;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<MemoryKind>("memory");
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((item) => URL.revokeObjectURL(item.url));
  }, [files]);

  const reset = () => {
    setKind("memory");
    setTitle("");
    setStory("");
    setCity("");
    setCountry("");
    setFiles([]);
    setProgress("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const canSave = !!day && !pending && (!!title.trim() || !!story.trim() || files.length > 0);

  const addFiles = (nextFiles: File[]) => {
    const accepted: File[] = [];
    for (const file of nextFiles) {
      if (files.length + accepted.length >= MAX_FILES) break;
      try {
        validateMediaFile(file, { maxBytes: file.type.startsWith("video/") ? MAX_VIDEO_BYTES : undefined });
        accepted.push(file);
      } catch (error: any) {
        toast.error(error?.message ?? `${file.name} n’est pas compatible.`);
      }
    }
    if (nextFiles.length + files.length > MAX_FILES) toast.info(`Tu peux ajouter jusqu’à ${MAX_FILES} photos ou vidéos par souvenir.`);
    setFiles((current) => [...current, ...accepted]);
  };

  const save = async () => {
    if (!canSave || !day) return;
    setPending(true);
    const uploaded: string[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const video = file.type.startsWith("video/");
        setProgress(`Envoi ${index + 1}/${files.length}…`);
        const metadata = video ? await getVideoMetadata(file, MAX_VIDEO_SECONDS) : undefined;
        const path = await uploadMedia(userId, "trips", file, {
          maxBytes: video ? MAX_VIDEO_BYTES : undefined,
          maxVideoDurationSeconds: MAX_VIDEO_SECONDS,
          ...(metadata ? { verifiedVideoMetadata: metadata } : {}),
          onProgress: (value) => setProgress(`Envoi ${index + 1}/${files.length} · ${Math.max(1, Math.round(value * 100))}%`),
        });
        uploaded.push(path);
      }

      const firstVideo = uploaded.find((path) => isVideoPath(path)) ?? null;
      const derivedTitle = title.trim() || story.trim().split("\n")[0]?.slice(0, 80) || `Souvenir · ${dayLabel(day)}`;
      const dbKind = kind === "memory" ? "photo" : kind;
      setProgress(city.trim() || country.trim() ? "Localisation du souvenir…" : "Enregistrement…");
      const coords = await geocodeMemoryLocation(city.trim(), country.trim());
      const { error } = await supabase.from("trip_entries").insert({
        trip_id: tripId,
        user_id: userId,
        kind: dbKind,
        title: derivedTitle,
        city: city.trim() || null,
        country: country.trim() || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        notes: story.trim() || null,
        media_urls: uploaded,
        image_url: null,
        video_url: firstVideo,
        visited_on: day,
        position: Math.floor(Date.now() % 2_000_000_000),
      });
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["trip-entries", tripId] });
      toast.success(files.length ? "Souvenir et médias ajoutés ✨" : "Souvenir ajouté ✨");
      reset();
      onOpenChange(false);
    } catch (error: any) {
      if (uploaded.length) await supabase.storage.from("media").remove(uploaded).catch(() => undefined);
      toast.error(error?.message ?? "Impossible d’enregistrer ce souvenir.");
    } finally {
      setPending(false);
      setProgress("");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>Raconte ta journée</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {day ? dayLabel(day) : "Choisis d’abord une journée"} · texte, photos, vidéos et lieux.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {MEMORY_KINDS.map((item) => {
              const Icon = item.icon;
              const active = kind === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setKind(item.value)}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-[11px] font-medium transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titre du souvenir (facultatif)" />
          <Textarea
            value={story}
            onChange={(event) => setStory(event.target.value)}
            rows={6}
            placeholder="Raconte ce que tu as fait, ce que tu as aimé, une anecdote, ton ressenti…"
            className="resize-none text-base leading-6"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ville / lieu" />
            <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder="Pays" />
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary/40"
            >
              <ImagePlus className="h-5 w-5 text-primary" /> Photos
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary/40"
            >
              <Video className="h-5 w-5 text-primary" /> Vidéos
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Jusqu’à {MAX_FILES} médias. Vidéos : 2 min et 45 Mo maximum chacune.</p>

          {previews.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {previews.map(({ file, url }, index) => (
                <div key={`${file.name}-${file.lastModified}-${index}`} className="relative overflow-hidden rounded-xl border border-border bg-muted">
                  {file.type.startsWith("video/") ? (
                    <video src={url} muted playsInline className="aspect-square h-full w-full object-cover" />
                  ) : (
                    <img src={url} alt="Aperçu" className="aspect-square h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    aria-label="Retirer ce média"
                    onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                    className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-white">
                    {file.type.startsWith("video/") ? "Vidéo" : "Photo"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {progress && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
              <Loader2 className="h-4 w-4 animate-spin" /> {progress}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button disabled={!canSave} onClick={save} className="w-full rounded-xl sm:w-auto">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
            Enregistrer dans ma journée
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TravelJournalEnhancer() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tripId = useMemo(() => tripIdFromPath(pathname), [pathname]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<DaySlot[]>([]);

  const { data: days = [] } = useQuery({
    queryKey: ["trip-days", tripId],
    enabled: !!tripId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("trip_days").select("*").eq("trip_id", tripId!).order("day_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["trip-entries", tripId],
    enabled: !!tripId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_entries")
        .select("*")
        .eq("trip_id", tripId!)
        .order("visited_on")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderedDays = useMemo(() => {
    const values = new Set<string>();
    days.forEach((item: any) => item.day_date && values.add(item.day_date));
    entries.forEach((entry: any) => entry.visited_on && values.add(entry.visited_on));
    return Array.from(values).sort();
  }, [days, entries]);

  useEffect(() => {
    if (!tripId) return;

    const enhance = () => {
      for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("button"))) {
        if (!button.textContent?.includes("Ajouter au journal")) continue;
        const textNode = Array.from(button.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("Ajouter au journal"),
        );
        if (textNode) textNode.textContent = " Ajouter un souvenir";
        button.setAttribute("aria-label", "Ajouter un souvenir, une photo ou une vidéo à cette journée");
      }

      for (const paragraph of Array.from(document.querySelectorAll<HTMLParagraphElement>("p"))) {
        if (paragraph.textContent?.trim() !== "Raconte ta journée") continue;
        const card = paragraph.parentElement?.parentElement;
        if (!card) continue;
        card.dataset.journalStepTwo = "true";
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", "Raconter une journée et ajouter des photos ou vidéos");
        card.style.cursor = "pointer";
        const subtitle = paragraph.parentElement?.querySelector("p.text-xs");
        const desired = "Texte, photos, vidéos, lieux et dépenses.";
        if (subtitle && subtitle.textContent !== desired) subtitle.textContent = desired;
      }
    };

    const openForTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const step = target.closest<HTMLElement>("[data-journal-step-two='true']");
      if (step) {
        if (!orderedDays.length) {
          toast.info("Ajoute d’abord une journée.");
          return true;
        }
        setSelectedDay(orderedDays[0]);
        setComposerOpen(true);
        return true;
      }

      const button = target.closest<HTMLButtonElement>("button");
      if (!button || !/Ajouter (?:au journal|un souvenir)/i.test(button.textContent ?? "")) return false;
      const article = button.closest<HTMLElement>("article.animate-rise");
      const articles = Array.from(document.querySelectorAll<HTMLElement>(".app-page article.animate-rise"));
      const articleIndex = article ? articles.indexOf(article) : -1;
      const day = articleIndex >= 0 ? orderedDays[articleIndex] : orderedDays[0];
      if (!day) {
        toast.info("Ajoute d’abord une journée.");
        return true;
      }
      setSelectedDay(day);
      setComposerOpen(true);
      return true;
    };

    const clickHandler = (event: MouseEvent) => {
      if (!openForTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-journal-step-two='true']")) return;
      if (openForTarget(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", clickHandler, true);
    document.addEventListener("keydown", keyHandler, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", clickHandler, true);
      document.removeEventListener("keydown", keyHandler, true);
    };
  }, [tripId, orderedDays]);

  useEffect(() => {
    if (!tripId || !orderedDays.length) {
      setSlots([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const articles = Array.from(document.querySelectorAll<HTMLElement>(".app-page article.animate-rise"));
      const next: DaySlot[] = [];
      orderedDays.forEach((day, index) => {
        const article = articles[index];
        if (!article) return;
        let slot = article.querySelector<HTMLElement>(":scope > .travel-memory-slot");
        if (!slot) {
          slot = document.createElement("div");
          slot.className = "travel-memory-slot";
          article.appendChild(slot);
        }
        next.push({ day, element: slot });
      });
      setSlots(next);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [tripId, orderedDays, entries.length]);

  useEffect(() => {
    if (tripId) return;
    for (const slot of Array.from(document.querySelectorAll(".travel-memory-slot"))) slot.remove();
    setSlots([]);
  }, [tripId]);

  if (!tripId || !user) return null;

  return (
    <>
      {slots.map((slot) =>
        createPortal(
          <MemoryGallery day={slot.day} tripId={tripId} entries={entries} />,
          slot.element,
          `${tripId}-${slot.day}`,
        ),
      )}
      <MemoryComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        tripId={tripId}
        userId={user.id}
        day={selectedDay}
      />
    </>
  );
}
