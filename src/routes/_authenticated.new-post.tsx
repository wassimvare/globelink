import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Play, UploadCloud, Video, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  createStoryVideoPoster,
  getVideoMetadata,
  MAX_STORY_VIDEO_DURATION_SECONDS,
  primeMediaManifestCache,
  uploadMedia,
  uploadPostVideoChunks,
  validateMediaFile,
  type VideoMetadata,
} from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRIES } from "@/lib/countries";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/new-post")({
  component: NewPostPage,
});

const POST_VIDEO_MAX_SECONDS = MAX_STORY_VIDEO_DURATION_SECONDS;
const VIDEO_UPLOAD_RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
const POST_DIRECT_VIDEO_MAX_BYTES = 42_000_000;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} Mo`;
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function NewPostPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [checkingFile, setCheckingFile] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [caption, setCaption] = useState("");
  const [country, setCountry] = useState<string>("");
  const [city, setCity] = useState("");

  const isVideo = !!file?.type.startsWith("video/");

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const mediaDescription = useMemo(() => {
    if (!file) return null;
    const parts = [isVideo ? "Vidéo" : "Photo", formatBytes(file.size)];
    if (videoMetadata) parts.push(formatDuration(videoMetadata.durationSeconds));
    return parts.join(" · ");
  }, [file, isVideo, videoMetadata]);

  function resetFile() {
    setFile(null);
    setVideoMetadata(null);
    setProgressLabel("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(nextFile: File | null) {
    if (!nextFile) return resetFile();
    setCheckingFile(true);
    setProgressLabel("Analyse du fichier…");
    try {
      const kind = validateMediaFile(nextFile, { maxBytes: null });
      const metadata = kind.isVideo
        ? await getVideoMetadata(nextFile, POST_VIDEO_MAX_SECONDS)
        : null;
      setFile(nextFile);
      setVideoMetadata(metadata);
      setProgressLabel("");
    } catch (error) {
      resetFile();
      toast.error(error instanceof Error ? error.message : "Ce fichier ne peut pas être publié.");
    } finally {
      setCheckingFile(false);
    }
  }

  const publish = useMutation({
    mutationFn: async () => {
      if (!user || !file) throw new Error("Ajoute une photo ou une vidéo.");

      const uploadedPaths: string[] = [];
      let createdPostId: string | null = null;

      try {
        if (!isVideo) {
          setProgressLabel("Envoi de la photo…");
          const imagePath = await uploadMedia(user.id, "posts", file);
          uploadedPaths.push(imagePath);

          const { data: createdPost, error: postError } = await supabase
            .from("posts")
            .insert({
              user_id: user.id,
              image_url: imagePath,
              video_url: null,
              caption: caption.trim() || null,
              country: country || null,
              city: city.trim() || null,
            })
            .select("id")
            .single();
          if (postError) throw postError;
          createdPostId = createdPost.id;

          const { error: mediaError } = await supabase.from("post_media").insert({
            post_id: createdPostId,
            url: imagePath,
            media_type: "image",
            position: 0,
          });
          if (mediaError) throw mediaError;
          return { kind: "image" as const, segments: 1 };
        }

        const metadata = videoMetadata ?? (await getVideoMetadata(file, POST_VIDEO_MAX_SECONDS));
        setProgressLabel("Création de l’aperçu…");
        const posterFile = await createStoryVideoPoster(file, 0);
        if (!posterFile)
          throw new Error(
            "Impossible de créer l’aperçu de cette vidéo. Essaie une vidéo MP4 ou MOV standard.",
          );

        const posterPath = await uploadMedia(user.id, "posts", posterFile, {
          onProgress: (progress) =>
            setProgressLabel(`Envoi de l’aperçu… ${Math.max(1, Math.round(progress * 10))}%`),
        });
        uploadedPaths.push(posterPath);

        let primaryVideoPath: string;
        let mediaChunks: string[] | null = null;
        let mediaMimeType: string | null = null;
        let mediaSizeBytes: number | null = null;

        if (file.size <= POST_DIRECT_VIDEO_MAX_BYTES) {
          setProgressLabel("Envoi de la vidéo… 10%");
          primaryVideoPath = await uploadMedia(user.id, "posts", file, {
            maxBytes: null,
            maxVideoDurationSeconds: POST_VIDEO_MAX_SECONDS,
            verifiedVideoMetadata: metadata,
            forceResumable: file.size > VIDEO_UPLOAD_RESUMABLE_THRESHOLD,
            onProgress: (progress) => {
              const percent = 10 + Math.round(progress * 85);
              setProgressLabel(`Envoi de la vidéo… ${Math.min(95, percent)}%`);
            },
          });
          uploadedPaths.push(primaryVideoPath);
        } else {
          setProgressLabel("Envoi de la vidéo… 10%");
          const manifest = await uploadPostVideoChunks(user.id, file, (progress) => {
            const percent = 10 + Math.round(progress * 85);
            setProgressLabel(`Envoi de la vidéo… ${Math.min(95, percent)}%`);
          });
          primaryVideoPath = manifest.paths[0];
          mediaChunks = manifest.paths;
          mediaMimeType = manifest.mimeType;
          mediaSizeBytes = manifest.totalBytes;
          uploadedPaths.push(...manifest.paths);
        }

        setProgressLabel("Finalisation… 97%");
        const { data: createdPost, error: postError } = await supabase
          .from("posts")
          .insert({
            user_id: user.id,
            image_url: posterPath,
            video_url: primaryVideoPath,
            caption: caption.trim() || null,
            country: country || null,
            city: city.trim() || null,
          })
          .select("id")
          .single();
        if (postError) throw postError;
        createdPostId = createdPost.id;

        const mediaPayload = {
          post_id: createdPostId,
          url: primaryVideoPath,
          media_type: "video" as const,
          position: 0,
          media_chunks: mediaChunks,
          media_mime_type: mediaMimeType,
          media_size_bytes: mediaSizeBytes,
        };
        const { error: mediaError } = await (supabase.from("post_media") as any).insert(
          mediaPayload,
        );
        if (mediaError) throw mediaError;

        primeMediaManifestCache(primaryVideoPath, mediaChunks, mediaMimeType || file.type, file);
        setProgressLabel("Publication terminée… 100%");
        return { kind: "video" as const, segments: 1 };
      } catch (error) {
        if (createdPostId) {
          try {
            await supabase.from("posts").delete().eq("id", createdPostId).eq("user_id", user.id);
          } catch {
            // Le nettoyage du stockage ci-dessous reste prioritaire.
          }
        }
        if (uploadedPaths.length) {
          await supabase.storage
            .from("media")
            .remove(uploadedPaths)
            .catch(() => undefined);
        }
        throw error;
      }
    },
    onSuccess: async ({ kind, segments }) => {
      setProgressLabel("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["feed"] }),
        qc.invalidateQueries({ queryKey: ["profile-posts", user?.id] }),
        qc.invalidateQueries({ queryKey: ["real-photos-of-day"] }),
      ]);
      toast.success(
        kind === "video"
          ? segments > 1
            ? "Vidéo publiée et optimisée pour une lecture fluide."
            : "Vidéo publiée !"
          : "Publication ajoutée !",
      );
      router.navigate({ to: "/" });
    },
    onError: (error: Error) => {
      setProgressLabel("");
      toast.error(error.message || "Publication impossible.", { duration: 12_000 });
    },
  });

  const busy = checkingFile || publish.isPending;

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="font-display text-3xl">Nouvelle publication</h1>
        <p className="mt-1 text-muted-foreground">
          Partage une photo ou une vidéo de voyage avec la communauté.
        </p>

        <div className="mt-6 space-y-5 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <div className="relative">
            <label className="flex aspect-[4/5] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-secondary transition hover:border-primary/40 hover:bg-accent/10 sm:aspect-square">
              {preview ? (
                isVideo ? (
                  <video
                    src={preview}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full bg-black object-contain"
                  />
                ) : (
                  <img
                    src={preview}
                    alt="Aperçu de la publication"
                    className="h-full w-full object-cover"
                  />
                )
              ) : (
                <div className="max-w-xs px-6 text-center text-muted-foreground">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-card shadow-soft">
                    <ImagePlus className="h-7 w-7" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    Choisir une photo ou une vidéo
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    JPG, PNG, WebP, GIF, MP4, MOV ou WebM · vidéo de 2 minutes maximum
                  </p>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                className="hidden"
                disabled={busy}
                onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
              />
            </label>

            {file && (
              <button
                type="button"
                onClick={resetFile}
                disabled={busy}
                aria-label="Retirer le fichier"
                className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/65 text-white shadow-soft backdrop-blur transition hover:bg-black/80 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            {file && mediaDescription && (
              <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
                {isVideo ? (
                  <Video className="h-3.5 w-3.5" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" />
                )}
                {mediaDescription}
              </div>
            )}
          </div>

          {checkingFile && (
            <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analyse de la vidéo…
            </div>
          )}

          <div>
            <Label>Légende</Label>
            <Textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Raconte ton voyage…"
              rows={3}
              maxLength={3000}
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {caption.length}/3000
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Pays</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ville</Label>
              <Input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Ex. Kyoto"
                maxLength={100}
              />
            </div>
          </div>

          <Button
            onClick={() => publish.mutate()}
            disabled={busy || !file}
            className="h-12 w-full rounded-xl gradient-hero text-primary-foreground shadow-soft"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {progressLabel || "Préparation…"}
              </>
            ) : isVideo ? (
              <>
                <Play className="mr-2 h-4 w-4 fill-current" /> Publier la vidéo
              </>
            ) : (
              <>
                <UploadCloud className="mr-2 h-4 w-4" /> Publier
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
