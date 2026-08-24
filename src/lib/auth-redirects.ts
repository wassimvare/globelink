/** Safe, same-origin URLs used by authentication e-mails and OAuth callbacks. */
const PRODUCTION_APP_ORIGIN = "https://globelink-theta.vercel.app";

export function publicAppOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  const configured = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* ignore invalid config */
    }
  }
  return process.env.NODE_ENV === "production" ? PRODUCTION_APP_ORIGIN : "http://127.0.0.1:5173";
}

export function authRedirect(path: string): string {
  const safePath =
    path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
  return new URL(safePath, `${publicAppOrigin()}/`).toString();
}

export function safeInternalPath(value?: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  return value;
}