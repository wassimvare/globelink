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
  | "trip_item_added";

type AnalyticsMetadataValue = string | number | boolean | null | undefined;
export type AnalyticsMetadata = Record<string, AnalyticsMetadataValue>;

const SESSION_KEY = "globelink:analytics-session";
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

  try {
    const { error } = await (supabase.rpc as any)("record_product_event", {
      p_event_name: eventName,
      p_session_id: sessionId,
      p_route: window.location.pathname,
      p_source: detectSource(),
      p_metadata: cleanMetadata(metadata),
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
