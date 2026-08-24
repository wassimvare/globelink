import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Volume2, VolumeX, X } from "lucide-react";
import { StoryLikeBar } from "@/components/StoryLikeBar";
import { prefetchStoryMedia } from "@/lib/storage";

export type StoryItem = {
  id: string;
  userId?: string;
  username: string;
  avatar?: string | null;
  media: string | null;
  poster?: string | null;
  mediaPath?: string | null;
  mediaChunks?: string[] | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  mediaType?: "image" | "video" | string | null;
  city?: string;
  storyGroupId?: string | null;
  segmentStartSeconds?: number;
  segmentEndSeconds?: number | null;
  segmentIndex?: number;
  segmentCount?: number;
};

const IMAGE_DURATION_MS = 5000;

/** Fullscreen story viewer with image timing, complete video playback, sound and mobile gestures. */
export function StoriesViewer({
  stories,
  startIndex = 0,
  onClose,
}: {
  stories: StoryItem[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [resolvedMedia, setResolvedMedia] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [muted, setMuted] = useState(true);
  const startY = useRef<number | null>(null);
  const paused = useRef(false);
  const segmentCompleted = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const current = stories[index];
  const currentMedia = resolvedMedia ?? current?.media ?? null;
  const hasMediaReference =
    !!current?.media || !!current?.mediaPath || !!current?.mediaChunks?.length;
  const isVideo = !!current && current.mediaType === "video";
  const segmentStartSeconds = Math.max(0, Number(current?.segmentStartSeconds ?? 0));
  const segmentEndSeconds =
    current?.segmentEndSeconds == null
      ? null
      : Math.max(segmentStartSeconds, Number(current.segmentEndSeconds));

  const next = useCallback(() => {
    setDirection(1);
    setProgress(0);
    setMediaReady(false);
    setMediaError(false);
    setResolvedMedia(null);
    setIndex((i) => {
      if (i + 1 >= stories.length) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [stories.length, onClose]);

  const prev = useCallback(() => {
    setDirection(-1);
    setProgress(0);
    setMediaReady(false);
    setMediaError(false);
    setResolvedMedia(null);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    setIndex(Math.min(Math.max(startIndex, 0), Math.max(stories.length - 1, 0)));
  }, [startIndex, stories.length]);

  useEffect(() => {
    let cancelled = false;
    setMediaReady(false);
    setMediaError(false);
    setProgress(0);
    setResolvedMedia(null);
    segmentCompleted.current = false;
    const story = stories[index];
    if (!story)
      return () => {
        cancelled = true;
      };

    if (story.media) {
      setResolvedMedia(story.media);
      return () => {
        cancelled = true;
      };
    }
    if (!story.mediaPath && !story.mediaChunks?.length) {
      setMediaError(true);
      return () => {
        cancelled = true;
      };
    }

    void prefetchStoryMedia(
      story.mediaPath,
      story.mediaChunks,
      story.mediaMimeType,
      story.mediaType,
    )
      .then((url) => {
        if (cancelled) return;
        if (!url) setMediaError(true);
        else setResolvedMedia(url);
      })
      .catch(() => {
        if (!cancelled) setMediaError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [index, stories]);

  useEffect(() => {
    const candidates = stories.slice(index + 1, index + 3);
    for (const story of candidates) {
      if (!story || story.media) continue;
      void prefetchStoryMedia(
        story.mediaPath,
        story.mediaChunks,
        story.mediaMimeType,
        story.mediaType,
      ).catch(() => undefined);
    }
  }, [index, stories]);

  // Images stay visible for five seconds. Videos use their real playback duration.
  useEffect(() => {
    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (isVideo) {
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration) && video.duration > 0) {
          const effectiveEnd =
            segmentEndSeconds == null
              ? video.duration
              : Math.min(segmentEndSeconds, video.duration);
          const effectiveDuration = Math.max(0.05, effectiveEnd - segmentStartSeconds);
          setProgress(
            Math.min(1, Math.max(0, (video.currentTime - segmentStartSeconds) / effectiveDuration)),
          );
        }
      } else {
        if (!paused.current && (mediaReady || !hasMediaReference) && !mediaError)
          elapsed += now - last;
        const value = Math.min(1, elapsed / IMAGE_DURATION_MS);
        setProgress(value);
        if (value >= 1) {
          next();
          return;
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    currentMedia,
    index,
    isVideo,
    mediaReady,
    mediaError,
    hasMediaReference,
    next,
    segmentStartSeconds,
    segmentEndSeconds,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentMedia || !isVideo) return;
    video.muted = muted;
    const play = async () => {
      try {
        await video.play();
      } catch {
        // Mobile browsers may wait for a tap. The media remains visible and playable.
        setMediaReady(true);
      }
    };
    void play();
  }, [currentMedia, index, isVideo, muted]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
      if (event.key.toLowerCase() === "m") setMuted((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [next, prev, onClose]);

  if (!current) return null;

  const resumeVideo = () => {
    const video = videoRef.current;
    if (video && isVideo && !mediaError) void video.play().catch(() => undefined);
  };

  const toggleSound = async () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    const video = videoRef.current;
    if (video) {
      video.muted = nextMuted;
      try {
        await video.play();
      } catch {
        // A second tap on the media will retry playback on restrictive browsers.
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black"
      style={{
        transform: `translateY(${dragY}px)`,
        opacity: dragY > 0 ? Math.max(0.3, 1 - dragY / 400) : 1,
        transition: startY.current === null ? "transform .25s ease, opacity .25s ease" : "none",
      }}
      onTouchStart={(event) => {
        startY.current = event.touches[0].clientY;
        paused.current = true;
        videoRef.current?.pause();
      }}
      onTouchMove={(event) => {
        if (startY.current === null) return;
        const dy = event.touches[0].clientY - startY.current;
        if (dy > 0) setDragY(dy);
      }}
      onTouchEnd={() => {
        paused.current = false;
        if (dragY > 110) {
          onClose();
          return;
        }
        startY.current = null;
        setDragY(0);
        resumeVideo();
      }}
    >
      <div className="absolute inset-x-0 top-0 z-30 flex gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {stories.map((story, storyIndex) => (
          <div key={story.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-75"
              style={{
                width:
                  storyIndex < index ? "100%" : storyIndex === index ? `${progress * 100}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 top-0 z-30 mt-8 flex items-center gap-3 px-4 text-white">
        <div className="h-9 w-9 overflow-hidden rounded-full bg-white/20">
          {current.avatar ? (
            <img src={current.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-sm font-semibold">
              {current.username[0]?.toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">@{current.username}</div>
          <div className="flex items-center gap-2 text-xs text-white/70">
            {current.city && <span className="truncate">{current.city}</span>}
            {(current.segmentCount ?? 1) > 1 && (
              <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5">
                {(current.segmentIndex ?? 0) + 1}/{current.segmentCount}
              </span>
            )}
          </div>
        </div>
        {isVideo && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void toggleSound();
            }}
            aria-label={muted ? "Activer le son" : "Couper le son"}
            className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          aria-label="Fermer"
          className={`${isVideo ? "" : "ml-auto"} grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur`}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative h-dvh w-dvw overflow-hidden bg-black">
        {isVideo && current.poster && (
          <img
            src={current.poster}
            alt="Aperçu de la story"
            loading="eager"
            decoding="async"
            className={`absolute inset-0 z-0 h-full w-full object-contain transition-opacity duration-200 ${mediaReady ? "opacity-0" : "opacity-100"}`}
          />
        )}

        {hasMediaReference && !mediaReady && !mediaError && (
          <div
            className={`absolute inset-0 z-0 grid place-items-center ${current.poster ? "bg-black/10" : "bg-black"}`}
          >
            <div className="absolute bottom-[max(5rem,env(safe-area-inset-bottom))] h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}

        {currentMedia &&
          !mediaError &&
          (isVideo ? (
            <video
              key={current.id}
              ref={videoRef}
              src={currentMedia}
              autoPlay
              muted={muted}
              playsInline
              preload="auto"
              controls={false}
              onClick={(event) => {
                event.stopPropagation();
                const video = event.currentTarget;
                if (video.paused) void video.play().catch(() => undefined);
                else video.pause();
              }}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                const maxStart = Math.max(0, video.duration - 0.05);
                const startAt = Math.min(segmentStartSeconds, maxStart);
                if (Math.abs(video.currentTime - startAt) > 0.05) video.currentTime = startAt;
                setMediaReady(true);
              }}
              onLoadedData={() => setMediaReady(true)}
              onCanPlay={(event) => {
                setMediaReady(true);
                const video = event.currentTarget;
                if (video.currentTime + 0.1 < segmentStartSeconds)
                  video.currentTime = segmentStartSeconds;
                void video.play().catch(() => undefined);
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                if (segmentEndSeconds == null || segmentCompleted.current) return;
                const effectiveEnd = Math.min(
                  segmentEndSeconds,
                  Number.isFinite(video.duration) ? video.duration : segmentEndSeconds,
                );
                if (video.currentTime >= effectiveEnd - 0.06) {
                  segmentCompleted.current = true;
                  video.pause();
                  next();
                }
              }}
              onEnded={() => {
                if (segmentCompleted.current) return;
                segmentCompleted.current = true;
                next();
              }}
              onError={() => {
                setMediaReady(true);
                setMediaError(true);
              }}
              className={`story-media-enter absolute inset-0 z-[1] h-full w-full object-contain ${direction > 0 ? "story-from-right" : "story-from-left"}`}
            />
          ) : (
            <img
              key={current.id}
              src={currentMedia}
              alt="Story"
              loading="eager"
              decoding="async"
              onLoad={() => setMediaReady(true)}
              onError={() => {
                setMediaReady(true);
                setMediaError(true);
              }}
              className={`story-media-enter absolute inset-0 z-[1] h-full w-full object-contain ${direction > 0 ? "story-from-right" : "story-from-left"}`}
            />
          ))}

        {(!hasMediaReference || mediaError) && (
          <div className="absolute inset-0 z-10 grid place-items-center px-6 text-center text-white">
            <div className="max-w-sm rounded-3xl bg-white/10 p-6 backdrop-blur">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8" />
              <p className="font-semibold">Impossible de lire cette story</p>
              <p className="mt-2 text-sm text-white/70">
                Le fichier est indisponible ou son format n’est pas compatible avec cet appareil.
              </p>
              <button
                type="button"
                onClick={next}
                className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black"
              >
                Story suivante
              </button>
            </div>
          </div>
        )}
      </div>

      {!mediaError && (
        <button
          type="button"
          aria-label="Story précédente"
          onClick={prev}
          className="absolute left-0 top-16 z-10 h-[calc(100%-9rem)] w-1/3"
        />
      )}
      {!mediaError && (
        <button
          type="button"
          aria-label="Story suivante"
          onClick={next}
          className="absolute right-0 top-16 z-10 h-[calc(100%-9rem)] w-2/3"
        />
      )}

      <StoryLikeBar storyId={current.id} ownerId={current.userId} />
    </div>
  );
}
