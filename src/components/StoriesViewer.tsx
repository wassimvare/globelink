import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { StoryLikeBar } from "@/components/StoryLikeBar";


export type StoryItem = {
  id: string;
  userId?: string;
  username: string;
  avatar?: string | null;
  media: string | null;
  mediaType?: "image" | "video" | string | null;
  city?: string;
};

const DURATION = 5000;

/** Instagram-like fullscreen story viewer: progress bars, tap-to-advance, swipe-down to close. */
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
  const [direction, setDirection] = useState<1 | -1>(1);
  const startY = useRef<number | null>(null);
  const paused = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const current = stories[index];

  const next = useCallback(() => {
    setDirection(1);
    setProgress(0);
    setMediaReady(false);
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
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    setIndex(Math.min(Math.max(startIndex, 0), Math.max(stories.length - 1, 0)));
  }, [startIndex, stories.length]);

  useEffect(() => {
    setMediaReady(false);
    const media = stories[index]?.media;
    if (!media) return;
    const preload = stories[index + 1]?.media;
    if (preload) {
      const nextIsVideo = stories[index + 1]?.mediaType === "video" || /\.(mp4|webm|mov)(\?|#|$)/i.test(preload);
      if (nextIsVideo) {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.src = preload;
      } else {
        const image = new Image();
        image.decoding = "async";
        image.src = preload;
      }
    }
  }, [index, stories]);

  // Auto-advance timer
  useEffect(() => {
    const started = Date.now();
    let raf = 0;
    let elapsedBefore = 0;
    let last = started;
    const tick = () => {
      const now = Date.now();
      if (!paused.current && (mediaReady || !current?.media)) elapsedBefore += now - last;
      last = now;
      const p = Math.min(1, elapsedBefore / DURATION);
      setProgress(p);
      if (p >= 1) { next(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current?.media, index, mediaReady, next]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current?.media) return;
    const play = async () => {
      try {
        await video.play();
      } catch {
        setMediaReady(true);
      }
    };
    void play();
  }, [current?.media, index]);

  // Keyboard controls + lock body scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [next, prev, onClose]);

  if (!current) return null;

  const isVideo = !!current.media && (current.mediaType === "video" || /\.(mp4|webm|mov)(\?|#|$)/i.test(current.media));

  return (
    <div
      className="fixed inset-0 z-[200] bg-black"
      style={{ transform: `translateY(${dragY}px)`, opacity: dragY > 0 ? Math.max(0.3, 1 - dragY / 400) : 1, transition: startY.current === null ? "transform .25s ease, opacity .25s ease" : "none" }}
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; paused.current = true; }}
      onTouchMove={(e) => {
        if (startY.current === null) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 0) setDragY(dy);
      }}
      onTouchEnd={() => {
        paused.current = false;
        if (dragY > 110) { onClose(); return; }
        startY.current = null;
        setDragY(0);
      }}
    >
      {/* progress bars */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {stories.map((s, i) => (
          <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* header */}
      <div className="absolute inset-x-0 top-0 z-20 mt-8 flex items-center gap-3 px-4 text-white">
        <div className="h-9 w-9 overflow-hidden rounded-full bg-white/20">
          {current.avatar && <img src={current.avatar} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">@{current.username}</div>
          {current.city && <div className="truncate text-xs text-white/70">{current.city}</div>}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Fermer"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-white/15 backdrop-blur"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* media */}
      <div className="relative h-dvh w-dvw overflow-hidden bg-black">
        {current.media && !mediaReady && (
          <div className="absolute inset-0 z-0 grid place-items-center bg-black">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
        {current.media && (isVideo ? (
          <video
            key={current.id}
            ref={videoRef}
            src={current.media}
            autoPlay
            muted
            playsInline
            preload="auto"
            controls={false}
            onLoadedData={() => setMediaReady(true)}
            onCanPlay={() => setMediaReady(true)}
            onEnded={next}
            onError={() => window.setTimeout(next, 250)}
            className={`story-media-enter absolute inset-0 z-[1] h-full w-full object-contain ${direction > 0 ? "story-from-right" : "story-from-left"}`}
          />
        ) : (
          <img
            key={current.id}
            src={current.media}
            alt=""
            loading="eager"
            decoding="async"
            onLoad={() => setMediaReady(true)}
            onError={() => window.setTimeout(next, 250)}
            className={`story-media-enter absolute inset-0 z-[1] h-full w-full object-contain ${direction > 0 ? "story-from-right" : "story-from-left"}`}
          />
        ))}
        {!current.media && <div className="px-6 text-center text-sm text-white/70">Story indisponible</div>}
      </div>

      {/* tap zones: left = previous, right = next */}
      <button type="button" aria-label="Story précédente" onClick={prev} className="absolute left-0 top-16 z-10 h-[calc(100%-9rem)] w-1/3" />
      <button type="button" aria-label="Story suivante" onClick={next} className="absolute right-0 top-16 z-10 h-[calc(100%-9rem)] w-2/3" />

      <StoryLikeBar storyId={current.id} ownerId={current.userId} />
    </div>
  );
}

