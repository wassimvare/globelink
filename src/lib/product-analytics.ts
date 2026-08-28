import { supabase } from "@/integrations/supabase/client";

export type ProductEventName =
  | "page_view"
  | "explorer_opened"
  | "voyage_opened"
  | "ai_opened"
  | "travel_match_opened"
  | "post_creation_opened"
  | "place_creation_opened"
  | "trip_created"
  | "trip_item_added"
  | "beta_joined";

type AnalyticsMetadataValue = string | number | boolean | null | undefined;
export type AnalyticsMetadata = Record<string, AnalyticsMetadataValue>;

const SESSION_KEY = "globelink:analytics-session";
const BETA_ROUND_KEY = "globelink:beta-round";
const ALLOWED_METADATA_KEYS = new Set([
  "area",
  "surface",
  "kind",
  "plan",
  "action",
  "result",
  "has_dates",
  "has_budget",
  "authenticated",
  "device",
  "beta_round",
]);

function isBrowser() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function analyticsDisabled() {
  if (!isBrowser()) return true;
  // Browser automation must never pollute production product metrics.
  if (navigator.webdriver) return true;
  return false;
}

function newSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `gl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function getSessionId() {
  if (!isBrowser()) return "";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && existing.length >= 8) return existing;
    const created = newSessionId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return newSessionId();
  }
}

export function markBetaRound(round = "private-1") {
  if (!isBrowser()) return;
  const normalized = round.trim().slice(0, 40);
  if (!normalized) return;
  try {
    window.localStorage.setItem(BETA_ROUND_KEY, normalized);
  } catch {
    // Analytics must never block the product if local storage is unavailable.
  }
}

export function getBetaRound() {
  if (!isBrowser()) return null;
  try {
    const value = window.localStorage.getItem(BETA_ROUND_KEY)?.trim();
    return value ? value.slice(0, 40) : null;
  } catch {
    return null;
  }
}

function sanitizeRoute(pathname: string) {
  const route = pathname.split("?")[0]?.slice(0, 300) || "/";
  const privateDetailRoutes = [
    ["/profile/", "/profile/:username"],
    ["/trips/", "/trips/:id"],
    ["/post/", "/post/:id"],
    ["/messages/", "/messages/:id"],
    ["/marketplace/", "/marketplace/:id"],
    ["/place-status/", "/place-status/:id"],
    ["/destinations/", "/destinations/:slug"],
    ["/activities/", "/activities/:slug"],
    ["/deals/", "/deals/:slug"],
    ["/questions/", "/questions/:slug"],
  ] as const;

  for (const [prefix, replacement] of privateDetailRoutes) {
    if (route.startsWith(prefix) && route.length > prefix.length) return replacement;
  }
  return route;
}

function detectSource(): "web" | "mobile-web" | "pwa" {
  if (!isBrowser()) return "web";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  if (standalone) return "pwa";
  return window.matchMedia?.("(max-width: 767px)").matches ? "mobile-web" : "web";
}

function detectDevice() {
  if (!isBrowser()) return "unknown";
  if (window.matchMedia?.("(max-width: 767px)").matches) return "mobile";
  if (window.matchMedia?.("(max-width: 1100px)").matches) return "tablet";
  return "desktop";
}

function cleanMetadata(metadata: AnalyticsMetadata = {}) {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key) || value === undefined) continue;
    if (typeof value === "string") clean[key] = value.slice(0, 80);
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean" || value === null) clean[key] = value;
  }
  clean.device = detectDevice();
  return clean;
}

export async function trackProductEvent(
  eventName: ProductEventName,
  metadata: AnalyticsMetadata = {},
) {
  if (analyticsDisabled()) return;

  const sessionId = getSessionId();
  if (!sessionId) return;

  const betaRound = getBetaRound();
  const contextualMetadata = betaRound ? { ...metadata, beta_round: betaRound } : metadata;

  try {
    const { error } = await (supabase.rpc as any)("record_product_event", {
      p_event_name: eventName,
      p_session_id: sessionId,
      p_route: sanitizeRoute(window.location.pathname),
      p_source: detectSource(),
      p_metadata: cleanMetadata(contextualMetadata),
    });

    if (error && import.meta.env.DEV) {
      console.debug("[GlobeLink analytics] event skipped", error.message);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.debug("[GlobeLink analytics] unavailable", error);
    }
  }
}
