import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function withSecurityHeaders(response: Response, requestUrl?: URL): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("X-Download-Options", "noopen");
  headers.set("Origin-Agent-Cluster", "?1");
  headers.set("X-Robots-Tag", response.status >= 400 ? "noindex, nofollow" : "all");
  const contentType = headers.get("content-type") ?? "";
  const url = response.url || requestUrl?.pathname || "";
  if (/\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg|ico)(?:\?|$)/i.test(url)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (contentType.includes("text/html")) {
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  if (requestUrl?.protocol === "https:" || response.url?.startsWith("https://")) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const isHttps = requestUrl?.protocol === "https:" || response.url?.startsWith("https://");
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "script-src 'self' 'unsafe-inline'",
    "frame-src 'self'",
    // Browser network access is limited to GlobeLink and Supabase.
    // Server-side AI/catalog requests are unaffected.
    isHttps
      ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
      : "connect-src 'self' http: ws: https://*.supabase.co wss://*.supabase.co",
    "form-action 'self' https://checkout.stripe.com",
  ];
  // Never upgrade local Wi-Fi HTTP requests to HTTPS: the local preview has no TLS certificate.
  if (isHttps) contentSecurityPolicy.push("upgrade-insecure-requests");
  headers.set("Content-Security-Policy", contentSecurityPolicy.join("; "));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const requestUrl = new URL(request.url);
    const method = request.method.toUpperCase();
    if (["TRACE", "TRACK", "CONNECT"].includes(method)) {
      return withSecurityHeaders(
        new Response("Méthode non autorisée", { status: 405 }),
        requestUrl,
      );
    }
    if (request.url.length > 8_192) {
      return withSecurityHeaders(new Response("URL trop longue", { status: 414 }), requestUrl);
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (
      requestUrl.pathname.startsWith("/api/") &&
      Number.isFinite(declaredLength) &&
      declaredLength > 1_000_000
    ) {
      return withSecurityHeaders(
        new Response("Requête trop volumineuse", { status: 413 }),
        requestUrl,
      );
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), requestUrl);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        requestUrl,
      );
    }
  },
};
