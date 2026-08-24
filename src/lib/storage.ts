import { supabase } from "@/integrations/supabase/client";
import { parseIsoBmffVideoMetadata } from "@/lib/video-metadata";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const VIDEO_METADATA_TIMEOUT_MS = 15_000;
const VIDEO_POSTER_TIMEOUT_MS = 5_000;
export const STORY_SEGMENT_SECONDS = 30;
export const MAX_STORY_VIDEO_DURATION_SECONDS = 2 * 60;
export const STORY_DIRECT_VIDEO_MAX_BYTES = 18 * 1024 * 1024;
const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const RESUMABLE_CHUNK_BYTES = 6 * 1024 * 1024;
const SAFE_FOLDER_ROOTS = new Set([
  "stories",
  "posts",
  "avatars",
  "banners",
  "places",
  "marketplace",
  "trips",
  "dm",
]);

type UploadMediaOptions = {
  /** null retire la limite locale. Les limites globales du projet Supabase restent applicables. */
  maxBytes?: number | null;
  maxVideoDurationSeconds?: number;
  forceResumable?: boolean;
  /** Progression réelle de l’envoi, entre 0 et 1. */
  onProgress?: (progress: number) => void;
  /** Évite de relire une seconde fois les métadonnées après getVideoMetadata(). */
  verifiedVideoMetadata?: VideoMetadata;
};

export type VideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
};

export type StoryVideoUploadMode = "direct" | "chunked";

export function getStoryVideoUploadMode(fileSizeBytes: number): StoryVideoUploadMode {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0)
    throw new Error("Taille de vidéo invalide.");
  return fileSizeBytes <= STORY_DIRECT_VIDEO_MAX_BYTES ? "direct" : "chunked";
}

function canvasToJpegFile(canvas: HTMLCanvasElement, prefix = "story-poster") {
  return new Promise<File | null>((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob?.size) {
          resolve(null);
          return;
        }
        resolve(
          new File([blob], `${prefix}-${crypto.randomUUID()}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          }),
        );
      },
      "image/jpeg",
      0.78,
    );
  });
}

function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 60_000) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", ready);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("error", failed);
      callback();
    };
    const ready = () => {
      if (
        Number.isFinite(video.duration) &&
        video.duration > 0 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        finish(resolve);
      }
    };
    const failed = () =>
      finish(() => reject(new Error("La vidéo ne peut pas être préparée sur cet appareil.")));
    const timer = window.setTimeout(
      () => finish(() => reject(new Error("La préparation de la vidéo a pris trop de temps."))),
      timeoutMs,
    );
    video.addEventListener("loadedmetadata", ready);
    video.addEventListener("loadeddata", ready);
    video.addEventListener("canplay", ready);
    video.addEventListener("error", failed, { once: true });
    video.load();
  });
}

function seekVideo(video: HTMLVideoElement, seconds: number) {
  const target = Math.max(0, Math.min(seconds, Math.max(0, video.duration - 0.05)));
  if (Math.abs(video.currentTime - target) < 0.08) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Impossible de préparer ce passage de la vidéo."));
    }, 20_000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("La vidéo ne peut pas être découpée sur cet appareil."));
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = target;
  });
}

/** Génère une image légère immédiatement visible pendant le chargement de la vidéo. */
export async function createStoryVideoPoster(
  sourceFile: File,
  atSeconds = 0,
): Promise<File | null> {
  if (typeof document === "undefined") return null;
  const sourceUrl = URL.createObjectURL(sourceFile);
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.preload = "auto";
  video.playsInline = true;
  video.muted = true;
  try {
    await waitForVideoReady(video, VIDEO_POSTER_TIMEOUT_MS);
    await seekVideo(video, atSeconds);
    const scale = Math.min(
      1,
      720 / Math.max(1, video.videoWidth),
      1280 / Math.max(1, video.videoHeight),
    );
    const width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    const height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    return canvasToJpegFile(canvas);
  } catch {
    return null;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

function safeExtension(file: File) {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  return byType[file.type] ?? "bin";
}

function normalizeFolder(folder: string) {
  const clean = folder.trim().replace(/^\/+|\/+$/g, "");
  const segments = clean.split("/");
  if (!segments.length || !SAFE_FOLDER_ROOTS.has(segments[0]))
    throw new Error("Dossier média invalide");
  if (segments.some((segment) => !/^[a-z0-9_-]+$/i.test(segment)))
    throw new Error("Dossier média invalide");
  return segments.join("/");
}

async function verifyDecodableMedia(
  file: File,
  isImage: boolean,
  isVideo: boolean,
  maxVideoDurationSeconds: number,
): Promise<VideoMetadata | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    if (isImage && file.type !== "image/gif") {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const pixels = image.naturalWidth * image.naturalHeight;
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth > 12000 ||
        image.naturalHeight > 12000 ||
        pixels > 40_000_000
      ) {
        throw new Error("Dimensions d’image invalides ou excessives.");
      }
    }
    if (isVideo) {
      return await new Promise<VideoMetadata>((resolve, reject) => {
        const video = document.createElement("video");
        let settled = false;

        const cleanup = () => {
          window.clearTimeout(timer);
          video.removeEventListener("loadedmetadata", readMetadata);
          video.removeEventListener("durationchange", readMetadata);
          video.removeEventListener("loadeddata", readMetadata);
          video.removeEventListener("canplay", readMetadata);
          video.removeEventListener("resize", readMetadata);
          video.removeEventListener("error", fail);
          window.clearInterval(pollTimer);
          video.removeAttribute("src");
          video.load();
        };

        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback();
        };

        const fail = () =>
          finish(() =>
            reject(new Error("Vidéo illisible ou format non compatible sur cet appareil.")),
          );

        const readMetadata = () => {
          const duration = video.duration;
          // Safari peut annoncer Infinity lors du premier événement puis fournir la vraie durée
          // avec durationchange. On attend donc tant que la valeur n'est pas exploitable.
          if (!Number.isFinite(duration) || duration <= 0) return;
          if (duration > maxVideoDurationSeconds + 0.25) {
            finish(() => reject(new Error("La vidéo doit durer 2 minutes maximum.")));
            return;
          }
          if (!video.videoWidth || !video.videoHeight) return;
          if (video.videoWidth > 4096 || video.videoHeight > 4096) {
            finish(() =>
              reject(new Error("La résolution de la vidéo est trop élevée ou invalide.")),
            );
            return;
          }
          const metadata = {
            durationSeconds: duration,
            width: video.videoWidth,
            height: video.videoHeight,
          };
          finish(() => resolve(metadata));
        };

        const timer = window.setTimeout(() => {
          finish(() =>
            reject(
              new Error(
                "L’analyse de la vidéo a pris trop de temps. Réessaie sans fermer l’application.",
              ),
            ),
          );
        }, VIDEO_METADATA_TIMEOUT_MS);

        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.addEventListener("loadedmetadata", readMetadata);
        video.addEventListener("durationchange", readMetadata);
        video.addEventListener("loadeddata", readMetadata);
        video.addEventListener("canplay", readMetadata);
        video.addEventListener("resize", readMetadata);
        video.addEventListener("error", fail);
        const pollTimer = window.setInterval(readMetadata, 200);
        video.src = objectUrl;
        video.load();
      });
    }
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function getVideoMetadata(
  file: File,
  maxVideoDurationSeconds = MAX_STORY_VIDEO_DURATION_SECONDS,
): Promise<VideoMetadata> {
  const kind = validateMediaFile(file, { maxBytes: null });
  if (!kind.isVideo) throw new Error("Ce fichier n’est pas une vidéo.");
  await verifyFileSignature(file);
  let metadata: VideoMetadata | null = null;
  if (file.type === "video/mp4" || file.type === "video/quicktime") {
    try {
      metadata = await parseIsoBmffVideoMetadata(file);
    } catch {
      // Certains exports MP4 non standards nécessitent encore le décodeur du navigateur.
    }
  }
  metadata ??= await verifyDecodableMedia(file, false, true, maxVideoDurationSeconds);
  if (!metadata) throw new Error("Impossible de lire les informations de la vidéo.");
  if (metadata.durationSeconds > maxVideoDurationSeconds + 0.25) {
    throw new Error("La vidéo doit durer 2 minutes maximum.");
  }
  if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) {
    throw new Error("La résolution de la vidéo est trop élevée ou invalide.");
  }
  return metadata;
}

async function verifyFileSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const ascii = new TextDecoder("latin1").decode(bytes);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes
    .slice(0, 8)
    .every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  const isGif = ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a");
  const isWebp = ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  const isMp4Mov = ascii.slice(4, 8) === "ftyp";
  const isWebm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const matches: Record<string, boolean> = {
    "image/jpeg": isJpeg,
    "image/png": isPng,
    "image/gif": isGif,
    "image/webp": isWebp,
    "video/mp4": isMp4Mov,
    "video/quicktime": isMp4Mov,
    "video/webm": isWebm,
  };
  if (!matches[file.type])
    throw new Error("Le contenu du fichier ne correspond pas à son format annoncé.");
}

export function validateMediaFile(file: File, options: UploadMediaOptions = {}) {
  const isImage = IMAGE_TYPES.has(file.type);
  const isVideo = VIDEO_TYPES.has(file.type);
  if (!isImage && !isVideo)
    throw new Error("Format non pris en charge. Utilise JPG, PNG, WebP, GIF, MP4, WebM ou MOV.");
  if (file.size <= 0) throw new Error("Le fichier est vide.");

  const max =
    options.maxBytes === null
      ? null
      : (options.maxBytes ?? (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES));
  if (max !== null && file.size > max) {
    const maxMb = Math.floor(max / (1024 * 1024));
    throw new Error(`Le fichier dépasse ${maxMb} Mo.`);
  }
  return { isImage, isVideo };
}

function encodeTusMetadata(value: string) {
  return btoa(unescape(encodeURIComponent(value)));
}

function tusMetadata(path: string, file: File) {
  return [
    `bucketName ${encodeTusMetadata("media")}`,
    `objectName ${encodeTusMetadata(path)}`,
    `contentType ${encodeTusMetadata(file.type)}`,
    `cacheControl ${encodeTusMetadata("3600")}`,
  ].join(",");
}

function resumableEndpoints(supabaseUrl: string) {
  const base = supabaseUrl.replace(/\/$/, "");
  const parsed = new URL(base);
  const projectRef = parsed.hostname.split(".")[0];
  const endpoints = [
    `${parsed.protocol}//${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
  ];
  endpoints.push(`${base}/storage/v1/upload/resumable`);
  return [...new Set(endpoints)];
}

async function responseError(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return parsed.message || parsed.error || `Erreur HTTP ${response.status}`;
  } catch {
    return text || `Erreur HTTP ${response.status}`;
  }
}

async function createResumableUpload(
  file: File,
  path: string,
  accessToken: string,
  apiKey: string,
  supabaseUrl: string,
) {
  let lastError = "Impossible de préparer l’envoi de la vidéo.";
  for (const endpoint of resumableEndpoints(supabaseUrl)) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: apiKey,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(file.size),
          "Upload-Metadata": tusMetadata(path, file),
          "x-upsert": "false",
        },
      });
      if (!response.ok) {
        lastError = await responseError(response);
        continue;
      }
      const location = response.headers.get("Location");
      if (!location) {
        lastError = "Supabase n’a pas retourné l’adresse de reprise de l’envoi.";
        continue;
      }
      return new URL(location, endpoint).toString();
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function uploadChunk(
  uploadUrl: string,
  chunk: Blob,
  offset: number,
  accessToken: string,
  apiKey: string,
) {
  let attempt = 0;
  while (attempt < 4) {
    attempt += 1;
    try {
      const response = await fetch(uploadUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: apiKey,
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: chunk,
      });

      if (response.ok) {
        const next = Number(response.headers.get("Upload-Offset"));
        return Number.isFinite(next) ? next : offset + chunk.size;
      }

      if (response.status === 409) {
        const head = await fetch(uploadUrl, {
          method: "HEAD",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: apiKey,
            "Tus-Resumable": "1.0.0",
          },
        });
        const serverOffset = Number(head.headers.get("Upload-Offset"));
        if (head.ok && Number.isFinite(serverOffset)) return serverOffset;
      }

      if (![408, 429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(await responseError(response));
      }
    } catch (error) {
      if (attempt >= 4) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500 * attempt));
  }
  throw new Error("L’envoi de la vidéo a été interrompu.");
}

async function uploadMediaResumable(
  file: File,
  path: string,
  onProgress?: (progress: number) => void,
) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!accessToken) throw new Error("Ta session a expiré. Reconnecte-toi avant de publier.");
  if (!supabaseUrl || !apiKey) throw new Error("La configuration Supabase est incomplète.");

  const uploadUrl = await createResumableUpload(file, path, accessToken, apiKey, supabaseUrl);
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(file.size, offset + RESUMABLE_CHUNK_BYTES);
    const nextOffset = await uploadChunk(
      uploadUrl,
      file.slice(offset, end),
      offset,
      accessToken,
      apiKey,
    );
    if (nextOffset <= offset)
      throw new Error("Supabase n’a pas confirmé la progression de l’envoi.");
    offset = nextOffset;
    onProgress?.(Math.min(1, offset / Math.max(1, file.size)));
  }
}

export async function uploadMedia(
  userId: string,
  folder: string,
  file: File,
  options: UploadMediaOptions = {},
): Promise<string> {
  if (!userId || !/^[a-zA-Z0-9-]+$/.test(userId)) throw new Error("Utilisateur invalide");
  const safeFolder = normalizeFolder(folder);
  const kind = validateMediaFile(file, options);
  await verifyFileSignature(file);

  if (kind.isVideo && options.verifiedVideoMetadata) {
    if (
      options.verifiedVideoMetadata.durationSeconds >
      (options.maxVideoDurationSeconds ?? 180) + 0.25
    ) {
      throw new Error("La vidéo doit durer 2 minutes maximum.");
    }
  } else {
    await verifyDecodableMedia(
      file,
      kind.isImage,
      kind.isVideo,
      options.maxVideoDurationSeconds ?? 180,
    );
  }

  const path = `${userId}/${safeFolder}/${crypto.randomUUID()}.${safeExtension(file)}`;

  const uploadStandard = async () => {
    const { error } = await supabase.storage.from("media").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (!error) {
      options.onProgress?.(1);
      return;
    }
    if (/bucket.*not found/i.test(error.message))
      throw new Error("Le stockage des médias n’est pas encore configuré.");
    if (/maximum allowed size|payload too large|too large/i.test(error.message)) {
      throw new Error(
        "Le projet Supabase refuse la taille de cette vidéo. Vérifie la limite du bucket Media (50 Mo par objet).",
      );
    }
    throw error;
  };

  const useResumable = options.forceResumable || file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES;
  if (useResumable) {
    try {
      await uploadMediaResumable(file, path, options.onProgress);
      return path;
    } catch (resumableError) {
      // Certains Safari/iPhone ou réseaux filtrent le protocole TUS. Le POST classique
      // sert de secours maintenant que le bucket n'impose plus de plafond de taille.
      await supabase.storage
        .from("media")
        .remove([path])
        .catch(() => undefined);
      try {
        await uploadStandard();
        return path;
      } catch (standardError) {
        const resumableMessage =
          resumableError instanceof Error ? resumableError.message : "envoi reprenable refusé";
        const standardMessage =
          standardError instanceof Error ? standardError.message : "envoi classique refusé";
        throw new Error(`Envoi vidéo impossible (${resumableMessage}; ${standardMessage}).`);
      }
    }
  }

  await uploadStandard();
  return path;
}

/**
 * Les projets Supabase Free refusent un objet trop volumineux même quand le
 * bucket n'a pas de limite locale. Une vidéo de story est donc enregistrée en
 * objets binaires indépendants, chacun nettement sous la limite par objet.
 * Le fichier original est reconstruit octet pour octet uniquement à l'ouverture
 * de la story : aucune recompression, aucune perte de son ou de qualité.
 */
export const STORY_STORAGE_CHUNK_BYTES = 6 * 1024 * 1024;
export const POST_STORAGE_CHUNK_BYTES = 8 * 1024 * 1024;
const STORY_MAX_STORAGE_CHUNKS = 128;

export type StoryChunkUploadResult = {
  paths: string[];
  mimeType: string;
  totalBytes: number;
};

async function uploadStoryChunkWithRetry(path: string, chunk: Blob, contentType: string) {
  let lastMessage = "Envoi du morceau vidéo impossible.";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { error } = await supabase.storage.from("media").upload(path, chunk, {
      cacheControl: "3600",
      contentType,
      upsert: false,
    });
    if (!error) return;
    lastMessage = error.message || lastMessage;
    if (/maximum allowed size|payload too large|too large/i.test(lastMessage)) {
      throw new Error("Un morceau de la vidéo dépasse encore la limite Supabase.");
    }
    if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 500 * attempt));
  }
  throw new Error(lastMessage);
}

async function uploadVideoChunks(
  userId: string,
  folder: "stories" | "posts",
  file: File,
  onProgress?: (progress: number) => void,
): Promise<StoryChunkUploadResult> {
  if (!userId || !/^[a-zA-Z0-9-]+$/.test(userId)) throw new Error("Utilisateur invalide");
  const kind = validateMediaFile(file, { maxBytes: null });
  if (!kind.isVideo) throw new Error("Ce fichier n’est pas une vidéo.");
  await verifyFileSignature(file);

  const chunkBytes = folder === "posts" ? POST_STORAGE_CHUNK_BYTES : STORY_STORAGE_CHUNK_BYTES;
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkBytes));
  if (totalChunks > STORY_MAX_STORAGE_CHUNKS) {
    throw new Error("Cette vidéo est trop lourde pour être publiée depuis ce téléphone.");
  }

  const batchId = crypto.randomUUID();
  const extension = safeExtension(file);
  const paths: string[] = [];
  let uploadedBytes = 0;
  onProgress?.(0);

  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkBytes;
      const end = Math.min(file.size, start + chunkBytes);
      const path = `${userId}/${folder}/${batchId}/part-${String(index + 1).padStart(3, "0")}.${extension}`;
      const chunk = file.slice(start, end, file.type);
      await uploadStoryChunkWithRetry(path, chunk, file.type);
      paths.push(path);
      uploadedBytes += chunk.size;
      onProgress?.(Math.min(1, uploadedBytes / Math.max(1, file.size)));
    }
    return { paths, mimeType: file.type, totalBytes: file.size };
  } catch (error) {
    if (paths.length)
      await supabase.storage
        .from("media")
        .remove(paths)
        .catch(() => undefined);
    throw error;
  }
}

export async function uploadStoryVideoChunks(
  userId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<StoryChunkUploadResult> {
  return uploadVideoChunks(userId, "stories", file, onProgress);
}

/** Envoi fiable des vidéos de publication lourdes, sans réencodage local. */
export async function uploadPostVideoChunks(
  userId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<StoryChunkUploadResult> {
  return uploadVideoChunks(userId, "posts", file, onProgress);
}

const urlCache = new Map<string, { url: string; expires: number }>();
const blobUrlCache = new Map<string, { url: string; createdAt: number }>();

async function downloadMediaFallback(path: string): Promise<string | null> {
  const cached = blobUrlCache.get(path);
  if (cached) return cached.url;
  const { data, error } = await supabase.storage.from("media").download(path);
  if (error || !data) return null;
  const url = URL.createObjectURL(data);
  blobUrlCache.set(path, { url, createdAt: Date.now() });

  // Le fallback charge le fichier en mémoire. On limite donc fortement le cache.
  if (blobUrlCache.size > 8) {
    const oldest = [...blobUrlCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) {
      URL.revokeObjectURL(oldest[1].url);
      blobUrlCache.delete(oldest[0]);
    }
  }
  return url;
}

export async function getSignedMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https:\/\//i.test(path)) return path;
  if (/^http:\/\//i.test(path)) return null;
  if (path.includes("..") || path.startsWith("/")) return null;
  const cached = urlCache.get(path);
  const now = Date.now();
  if (cached && cached.expires > now + 60_000) return cached.url;

  try {
    const { data, error } = await supabase.storage
      .from("media")
      .createSignedUrl(path, 60 * 60 * 24);
    const signedUrl =
      data?.signedUrl ?? (data as unknown as { signedURL?: string } | null)?.signedURL;
    if (!error && signedUrl) {
      const url = normalizeSignedUrl(signedUrl);
      urlCache.set(path, { url, expires: now + 60 * 60 * 24 * 1000 });
      if (urlCache.size > 500) {
        for (const [key, value] of urlCache) if (value.expires <= now) urlCache.delete(key);
      }
      return url;
    }
  } catch {
    // Le téléchargement authentifié ci-dessous prend le relais.
  }

  // Certains navigateurs ou anciennes configurations Storage refusent ponctuellement
  // la création d'une URL signée. Le téléchargement authentifié permet quand même au
  // propriétaire et à ses abonnés autorisés de voir la story.
  return downloadMediaFallback(path);
}

function normalizeSignedUrl(url: string): string {
  if (!url.startsWith("/")) return url;
  const base = import.meta.env.VITE_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/storage/v1${url}` : url;
}

const storyManifestUrlCache = new Map<string, { url: string; createdAt: number }>();
const storyLocalPathUrlCache = new Map<string, { url: string; createdAt: number }>();
const storyManifestPromiseCache = new Map<string, Promise<string | null>>();
const storyPreloadCache = new Map<
  string,
  { media: HTMLVideoElement | HTMLImageElement; createdAt: number }
>();

function trimStoryManifestCache() {
  while (storyManifestUrlCache.size > 2) {
    const oldest = [...storyManifestUrlCache.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    )[0];
    if (!oldest) return;
    URL.revokeObjectURL(oldest[1].url);
    storyManifestUrlCache.delete(oldest[0]);
  }
}

function trimStoryPreloadCache() {
  while (storyPreloadCache.size > 4) {
    const oldest = [...storyPreloadCache.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    )[0];
    if (!oldest) return;
    if (oldest[1].media instanceof HTMLVideoElement) {
      oldest[1].media.pause();
      oldest[1].media.removeAttribute("src");
      oldest[1].media.load();
    } else {
      oldest[1].media.src = "";
    }
    storyPreloadCache.delete(oldest[0]);
  }
}

function trimStoryLocalPathCache() {
  while (storyLocalPathUrlCache.size > 4) {
    const oldest = [...storyLocalPathUrlCache.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    )[0];
    if (!oldest) return;
    URL.revokeObjectURL(oldest[1].url);
    storyLocalPathUrlCache.delete(oldest[0]);
  }
}

/** Place le fichier qui vient d'être publié dans le cache local du propriétaire. */
export function primeStoryMediaCache(
  mediaPath: string | null | undefined,
  mediaChunks: string[] | null | undefined,
  mimeType: string | null | undefined,
  file: Blob,
) {
  if (!file?.size) return;
  const chunks = (mediaChunks ?? []).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const url = URL.createObjectURL(
    file.type ? file : new Blob([file], { type: mimeType || "video/mp4" }),
  );
  if (chunks.length > 1) {
    const key = `${mimeType || file.type || "video/mp4"}:${chunks.join("|")}`;
    const previous = storyManifestUrlCache.get(key);
    if (previous) URL.revokeObjectURL(previous.url);
    storyManifestUrlCache.set(key, { url, createdAt: Date.now() });
    trimStoryManifestCache();
    return;
  }
  const path = chunks[0] ?? mediaPath;
  if (!path) {
    URL.revokeObjectURL(url);
    return;
  }
  const previous = storyLocalPathUrlCache.get(path);
  if (previous) URL.revokeObjectURL(previous.url);
  storyLocalPathUrlCache.set(path, { url, createdAt: Date.now() });
  trimStoryLocalPathCache();
}

async function downloadStoryParts(paths: string[]) {
  const results = new Array<Blob>(paths.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, paths.length) }, async () => {
    while (cursor < paths.length) {
      const index = cursor;
      cursor += 1;
      const { data, error } = await supabase.storage.from("media").download(paths[index]);
      if (error || !data) throw new Error("Un morceau de la vidéo est indisponible.");
      results[index] = data;
    }
  });
  await Promise.all(workers);
  return results;
}

/** Reconstruit une ancienne vidéo découpée en objets Storage. Les téléchargements
 * sont parallélisés et partagés entre tous les segments de la même publication. */
export async function getStoryMediaUrl(
  mediaPath: string | null | undefined,
  mediaChunks?: string[] | null,
  mimeType?: string | null,
): Promise<string | null> {
  const chunks = (mediaChunks ?? []).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (chunks.length <= 1) {
    const path = chunks[0] ?? mediaPath;
    const local = path ? storyLocalPathUrlCache.get(path) : null;
    if (local) {
      local.createdAt = Date.now();
      return local.url;
    }
    return getSignedMediaUrl(path);
  }

  const key = `${mimeType || "video/mp4"}:${chunks.join("|")}`;
  const cached = storyManifestUrlCache.get(key);
  if (cached) {
    cached.createdAt = Date.now();
    return cached.url;
  }

  const pending = storyManifestPromiseCache.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const parts = await downloadStoryParts(chunks);
    const complete = new Blob(parts, { type: mimeType || parts[0]?.type || "video/mp4" });
    const url = URL.createObjectURL(complete);
    storyManifestUrlCache.set(key, { url, createdAt: Date.now() });
    trimStoryManifestCache();
    return url;
  })();

  storyManifestPromiseCache.set(key, promise);
  try {
    return await promise;
  } finally {
    storyManifestPromiseCache.delete(key);
  }
}

/** Résout aussi les vidéos de publications enregistrées en plusieurs objets. */
export async function getMediaManifestUrl(
  mediaPath: string | null | undefined,
  mediaChunks?: string[] | null,
  mimeType?: string | null,
): Promise<string | null> {
  return getStoryMediaUrl(mediaPath, mediaChunks, mimeType);
}

/** Met immédiatement en cache un média nouvellement publié. */
export function primeMediaManifestCache(
  mediaPath: string | null | undefined,
  mediaChunks: string[] | null | undefined,
  mimeType: string | null | undefined,
  file: Blob,
) {
  primeStoryMediaCache(mediaPath, mediaChunks, mimeType, file);
}

/** Prépare la story actuelle ou suivante avant que l'utilisateur ne l'ouvre. */
export async function prefetchStoryMedia(
  mediaPath: string | null | undefined,
  mediaChunks?: string[] | null,
  mimeType?: string | null,
  mediaType: string | null | undefined = "video",
): Promise<string | null> {
  const url = await getStoryMediaUrl(mediaPath, mediaChunks, mimeType);
  if (!url || typeof document === "undefined") return url;
  const key = `${mediaType || "video"}:${url}`;
  const existing = storyPreloadCache.get(key);
  if (existing) {
    existing.createdAt = Date.now();
    return url;
  }

  if (mediaType === "video") {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.load();
    storyPreloadCache.set(key, { media: video, createdAt: Date.now() });
  } else {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    storyPreloadCache.set(key, { media: image, createdAt: Date.now() });
  }
  trimStoryPreloadCache();
  return url;
}

export async function getSignedMediaUrls(
  paths: (string | null | undefined)[],
): Promise<(string | null)[]> {
  return Promise.all(paths.map((p) => getSignedMediaUrl(p)));
}
