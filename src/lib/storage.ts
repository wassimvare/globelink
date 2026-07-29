import { supabase } from "@/integrations/supabase/client";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const SAFE_FOLDERS = new Set(["stories", "posts", "avatars", "places", "marketplace", "trips"]);

function safeExtension(file: File) {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  };
  return byType[file.type] ?? "bin";
}

async function verifyDecodableMedia(file: File, isImage: boolean, isVideo: boolean) {
  const objectUrl = URL.createObjectURL(file);
  try {
    if (isImage && file.type !== "image/gif") {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const pixels = image.naturalWidth * image.naturalHeight;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 12000 || image.naturalHeight > 12000 || pixels > 40_000_000) {
        throw new Error("Dimensions d’image invalides ou excessives.");
      }
    }
    if (isVideo) {
      await new Promise<void>((resolve, reject) => {
        const video = document.createElement("video");
        const timer = window.setTimeout(() => reject(new Error("Vidéo illisible ou format non compatible.")), 8000);
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          window.clearTimeout(timer);
          if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 180) {
            reject(new Error("La vidéo doit durer moins de 3 minutes."));
            return;
          }
          if (!video.videoWidth || !video.videoHeight || video.videoWidth > 4096 || video.videoHeight > 4096) {
            reject(new Error("La résolution de la vidéo est trop élevée ou invalide."));
            return;
          }
          resolve();
        };
        video.onerror = () => { window.clearTimeout(timer); reject(new Error("Vidéo illisible ou format non compatible.")); };
        video.src = objectUrl;
      });
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


async function verifyFileSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const ascii = new TextDecoder("latin1").decode(bytes);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.slice(0, 8).every((value, index) => value === [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][index]);
  const isGif = ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
  const isWebp = ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  const isMp4Mov = ascii.slice(4, 8) === "ftyp";
  const isWebm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const matches: Record<string, boolean> = {
    "image/jpeg": isJpeg, "image/png": isPng, "image/gif": isGif, "image/webp": isWebp,
    "video/mp4": isMp4Mov, "video/quicktime": isMp4Mov, "video/webm": isWebm,
  };
  if (!matches[file.type]) throw new Error("Le contenu du fichier ne correspond pas à son format annoncé.");
}

export function validateMediaFile(file: File) {
  const isImage = IMAGE_TYPES.has(file.type);
  const isVideo = VIDEO_TYPES.has(file.type);
  if (!isImage && !isVideo) throw new Error("Format non pris en charge. Utilise JPG, PNG, WebP, GIF, MP4, WebM ou MOV.");
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size <= 0 || file.size > max) {
    throw new Error(isVideo ? "La vidéo dépasse 80 Mo." : "L’image dépasse 12 Mo.");
  }
  return { isImage, isVideo };
}

export async function uploadMedia(userId: string, folder: string, file: File): Promise<string> {
  if (!userId || !/^[a-zA-Z0-9-]+$/.test(userId)) throw new Error("Utilisateur invalide");
  if (!SAFE_FOLDERS.has(folder)) throw new Error("Dossier média invalide");
  const kind = validateMediaFile(file);
  await verifyFileSignature(file);
  await verifyDecodableMedia(file, kind.isImage, kind.isVideo);
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${safeExtension(file)}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

const urlCache = new Map<string, { url: string; expires: number }>();

export async function getSignedMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https:\/\//i.test(path)) return path;
  if (/^http:\/\//i.test(path)) return null;
  if (path.includes("..") || path.startsWith("/")) return null;
  const cached = urlCache.get(path);
  const now = Date.now();
  if (cached && cached.expires > now + 60_000) return cached.url;
  const { data, error } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24);
  if (error || !data) return null;
  const signedUrl = data.signedUrl ?? (data as unknown as { signedURL?: string }).signedURL;
  if (!signedUrl) return null;
  const url = normalizeSignedUrl(signedUrl);
  urlCache.set(path, { url, expires: now + 60 * 60 * 24 * 1000 });
  if (urlCache.size > 500) {
    for (const [key, value] of urlCache) if (value.expires <= now) urlCache.delete(key);
  }
  return url;
}

function normalizeSignedUrl(url: string): string {
  if (!url.startsWith("/")) return url;
  const base = import.meta.env.VITE_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/storage/v1${url}` : url;
}

export async function getSignedMediaUrls(paths: (string | null | undefined)[]): Promise<(string | null)[]> {
  return Promise.all(paths.map((p) => getSignedMediaUrl(p)));
}
