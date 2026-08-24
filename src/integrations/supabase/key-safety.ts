/** Utilities that prevent privileged Supabase keys from being bundled into the browser. */

export function isOpaqueSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded =
      typeof atob === "function"
        ? atob(padded)
        : typeof Buffer !== "undefined"
          ? Buffer.from(padded, "base64").toString("utf8")
          : "";
    if (!decoded) return null;
    const payload = JSON.parse(decoded) as unknown;
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Browser/server-auth clients must only receive an anon/publishable key.
 * Rejects modern sb_secret_* keys and legacy JWT service_role keys.
 */
export function isSafeSupabasePublishableKey(value: string): boolean {
  const key = value.trim();
  if (!key || key.startsWith("sb_secret_")) return false;
  if (key.startsWith("sb_publishable_")) return true;

  const payload = decodeJwtPayload(key);
  if (!payload) return false;
  return payload.role !== "service_role";
}

export function assertSafeSupabasePublishableKey(value: string): void {
  if (!isSafeSupabasePublishableKey(value)) {
    throw new Error(
      "Configuration Supabase dangereuse : utilise uniquement une clé publishable/anon côté client. Une clé sb_secret_ ou service_role ne doit jamais être exposée au navigateur.",
    );
  }
}
