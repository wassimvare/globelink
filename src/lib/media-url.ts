import { supabase } from "@/integrations/supabase/client";

type CachedUrl = { url: string; expires: number };
const signedUrlCache = new Map<string, CachedUrl>();
const blobUrlCache = new Map<string, string>();

function normalizeSignedUrl(url: string): string {
  if (!url.startsWith("/")) return url;
  const base = import.meta.env.VITE_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/storage/v1${url}` : url;
}

async function downloadFallback(path: string): Promise<string | null> {
  const cached = blobUrlCache.get(path);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from("media").download(path);
  if (error || !data) return null;
  const url = URL.createObjectURL(data);
  blobUrlCache.set(path, url);
  return url;
}

/**
 * Lightweight signed media resolver for read-only UI such as the global header.
 * Keeps upload/video tooling out of the app-wide bundle.
 */
export async function getLightweightMediaUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  if (/^https:\/\//i.test(path)) return path;
  if (/^http:\/\//i.test(path)) return null;
  if (path.includes("..") || path.startsWith("/")) return null;

  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expires > now + 60_000) return cached.url;

  try {
    const { data, error } = await supabase.storage
      .from("media")
      .createSignedUrl(path, 60 * 60 * 24);
    const signedUrl =
      data?.signedUrl ?? (data as unknown as { signedURL?: string } | null)?.signedURL;
    if (!error && signedUrl) {
      const url = normalizeSignedUrl(signedUrl);
      signedUrlCache.set(path, { url, expires: now + 60 * 60 * 24 * 1000 });
      if (signedUrlCache.size > 200) {
        for (const [key, value] of signedUrlCache) {
          if (value.expires <= now) signedUrlCache.delete(key);
        }
      }
      return url;
    }
  } catch {
    // Fallback below.
  }

  return downloadFallback(path);
}
