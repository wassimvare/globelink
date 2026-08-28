import fs from "node:fs";

function update(path, transform) {
  const file = new URL(`../${path}`, import.meta.url);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`[Performance V1] ${path}: optimisé`);
  } else {
    console.log(`[Performance V1] ${path}: déjà conforme`);
  }
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`[performance-v1] Bloc introuvable: ${label}`);
  return source.replace(search, replacement);
}

update("src/routes/index.tsx", (source) => {
  if (source.includes("PERFORMANCE_V1_HOME")) return source;
  source = replaceRequired(
    source,
    `    staleTime: 10_000,\n    refetchInterval: 30_000,\n    refetchOnWindowFocus: true,`,
    `    staleTime: 60_000,\n    gcTime: 10 * 60_000,\n    refetchOnWindowFocus: false,\n    // PERFORMANCE_V1_HOME — le realtime invalide déjà les stories`,
    "story polling",
  );
  return source;
});

update("src/components/AppHeader.tsx", (source) => {
  if (source.includes("PERFORMANCE_V1_HEADER")) return source;
  source = replaceRequired(
    source,
    `import { getSignedMediaUrl } from "@/lib/storage";`,
    `import { getLightweightMediaUrl } from "@/lib/media-url";\n// PERFORMANCE_V1_HEADER`,
    "lightweight avatar resolver",
  );
  source = source.replace(
    `    getSignedMediaUrl(profile?.avatar_url).then(setAvatarUrl);`,
    `    getLightweightMediaUrl(profile?.avatar_url).then(setAvatarUrl);`,
  );
  source = replaceRequired(
    source,
    `    enabled: !!user,\n    refetchInterval: 60_000,\n    queryFn: async () => {\n      const { data } = await supabase\n        .from("notifications")`,
    `    enabled: !!user,\n    staleTime: 60_000,\n    gcTime: 10 * 60_000,\n    refetchOnWindowFocus: false,\n    queryFn: async () => {\n      const { data } = await supabase\n        .from("notifications")`,
    "notification polling",
  );
  source = replaceRequired(
    source,
    `  useEffect(() => {\n    const onScroll = () => setScrolled(window.scrollY > 8);\n    onScroll();\n    window.addEventListener("scroll", onScroll, { passive: true });\n    return () => window.removeEventListener("scroll", onScroll);\n  }, []);`,
    `  useEffect(() => {\n    let lastScrolled = window.scrollY > 8;\n    setScrolled(lastScrolled);\n    const onScroll = () => {\n      const nextScrolled = window.scrollY > 8;\n      if (nextScrolled === lastScrolled) return;\n      lastScrolled = nextScrolled;\n      setScrolled(nextScrolled);\n    };\n    window.addEventListener("scroll", onScroll, { passive: true });\n    return () => window.removeEventListener("scroll", onScroll);\n  }, []);`,
    "header scroll render guard",
  );
  return source;
});

update("src/components/PostCard.tsx", (source) => {
  if (source.includes("PERFORMANCE_V1_POST_CARD")) return source;

  source = replaceRequired(
    source,
    `function useSigned(path: string | null | undefined) {\n  const [url, setUrl] = useState<string | null>(null);\n  useEffect(() => {\n    let active = true;\n    setUrl(null);\n    getSignedMediaUrl(path).then((nextUrl) => {\n      if (active) setUrl(nextUrl);\n    });\n    return () => {\n      active = false;\n    };\n  }, [path]);\n  return url;\n}`,
    `function useSigned(path: string | null | undefined, enabled = true) {\n  const [url, setUrl] = useState<string | null>(null);\n  useEffect(() => {\n    let active = true;\n    setUrl(null);\n    if (!enabled) return () => { active = false; };\n    getSignedMediaUrl(path).then((nextUrl) => {\n      if (active) setUrl(nextUrl);\n    });\n    return () => {\n      active = false;\n    };\n  }, [path, enabled]);\n  return url;\n}\n// PERFORMANCE_V1_POST_CARD`,
    "lazy signed media",
  );

  source = replaceRequired(
    source,
    `function useResolvedMedia(media: Media | null | undefined) {\n  const [url, setUrl] = useState<string | null>(null);\n  const chunkKey = media?.media_chunks?.join("|") ?? "";\n  useEffect(() => {\n    let active = true;\n    setUrl(null);\n    const chunks = chunkKey ? chunkKey.split("|") : null;\n    getMediaManifestUrl(media?.url, chunks, media?.media_mime_type)\n      .then((nextUrl) => {\n        if (active) setUrl(nextUrl);\n      })\n      .catch(() => {\n        if (active) setUrl(null);\n      });\n    return () => {\n      active = false;\n    };\n  }, [media?.url, media?.media_mime_type, chunkKey]);\n  return url;\n}`,
    `function useResolvedMedia(media: Media | null | undefined, enabled = true) {\n  const [url, setUrl] = useState<string | null>(null);\n  const chunkKey = media?.media_chunks?.join("|") ?? "";\n  useEffect(() => {\n    let active = true;\n    setUrl(null);\n    if (!enabled) return () => { active = false; };\n    const chunks = chunkKey ? chunkKey.split("|") : null;\n    getMediaManifestUrl(media?.url, chunks, media?.media_mime_type)\n      .then((nextUrl) => {\n        if (active) setUrl(nextUrl);\n      })\n      .catch(() => {\n        if (active) setUrl(null);\n      });\n    return () => {\n      active = false;\n    };\n  }, [media?.url, media?.media_mime_type, chunkKey, enabled]);\n  return url;\n}`,
    "lazy media manifest",
  );

  source = replaceRequired(
    source,
    `  const videoRef = useRef<HTMLVideoElement | null>(null);\n\n  const media: Media[] =`,
    `  const videoRef = useRef<HTMLVideoElement | null>(null);\n  const cardRef = useRef<HTMLElement | null>(null);\n  const [nearViewport, setNearViewport] = useState(false);\n\n  useEffect(() => {\n    const node = cardRef.current;\n    if (!node || nearViewport) return;\n    if (!("IntersectionObserver" in window)) {\n      setNearViewport(true);\n      return;\n    }\n    const observer = new IntersectionObserver(\n      ([entry]) => {\n        if (!entry.isIntersecting) return;\n        setNearViewport(true);\n        observer.disconnect();\n      },\n      { rootMargin: "800px 0px" },\n    );\n    observer.observe(node);\n    return () => observer.disconnect();\n  }, [nearViewport]);\n\n  const media: Media[] =`,
    "post viewport gate",
  );

  source = replaceRequired(
    source,
    `  const mediaUrl = useResolvedMedia(current);\n  const posterUrl = useSigned(post.image_url);\n  const avatarUrl = useSigned(post.profiles?.avatar_url);`,
    `  const mediaUrl = useResolvedMedia(current, nearViewport);\n  const posterUrl = useSigned(post.image_url, nearViewport);\n  const avatarUrl = useSigned(post.profiles?.avatar_url, nearViewport);`,
    "defer post media",
  );

  source = replaceRequired(
    source,
    `    queryKey: ["post-reaction", post.id, user?.id],\n    enabled: !!user,`,
    `    queryKey: ["post-reaction", post.id, user?.id],\n    enabled: !!user && nearViewport,\n    staleTime: 60_000,`,
    "defer reaction query",
  );
  source = replaceRequired(
    source,
    `    queryKey: ["post-saved", post.id, user?.id],\n    enabled: !!user,`,
    `    queryKey: ["post-saved", post.id, user?.id],\n    enabled: !!user && nearViewport,\n    staleTime: 60_000,`,
    "defer saved query",
  );
  source = replaceRequired(
    source,
    `    queryKey: ["follow-card", user?.id, post.user_id],\n    enabled: !!user && !isSelf,`,
    `    queryKey: ["follow-card", user?.id, post.user_id],\n    enabled: !!user && !isSelf && nearViewport,\n    staleTime: 60_000,`,
    "defer follow query",
  );

  source = replaceRequired(
    source,
    `<article className="group surface-card interactive-card media-polish animate-rise overflow-hidden rounded-[1.75rem]">`,
    `<article ref={cardRef} className="feed-lazy-card group surface-card interactive-card media-polish animate-rise overflow-hidden rounded-[1.75rem]">`,
    "post render containment",
  );

  return source;
});

update("src/styles.css", (source) => {
  if (source.includes("PERFORMANCE_V1_CSS")) return source;
  return `${source}\n\n/* PERFORMANCE_V1_CSS: skip layout/paint work for feed cards far below the viewport. */\n@supports (content-visibility: auto) {\n  .feed-lazy-card {\n    content-visibility: auto;\n    contain-intrinsic-size: 760px;\n  }\n}\n`;
});

console.log("[Performance V1] Requêtes realtime dédoublonnées, médias du feed différés et rendu hors écran optimisé.");
