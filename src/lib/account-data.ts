import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type AccountSession = {
  session_id: string;
  created_at: string;
  updated_at: string;
  refreshed_at: string | null;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
  not_after: string | null;
  is_current: boolean;
};

export type SecurityEvent = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function listMySessions(): Promise<AccountSession[]> {
  const { data, error } = await db.rpc("list_my_sessions");
  if (error) throw error;
  return (data ?? []) as AccountSession[];
}

export async function revokeMySession(sessionId: string) {
  const { data, error } = await db.rpc("revoke_my_session", { _session_id: sessionId });
  if (error) throw error;
  return Boolean(data);
}

export async function listSecurityEvents(limit = 30): Promise<SecurityEvent[]> {
  const { data, error } = await db
    .from("account_security_events")
    .select("id,event_type,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) throw error;
  return (data ?? []) as SecurityEvent[];
}

export async function logSecurityEvent(eventType: string, metadata: Record<string, unknown> = {}) {
  const { error } = await db.rpc("log_my_security_event", {
    _event_type: eventType,
    _metadata: metadata,
  });
  if (error) console.warn("Security event was not recorded", error.message);
}

export async function deactivateAccount() {
  const { error } = await db.rpc("deactivate_my_account");
  if (error) throw error;
}

export async function reactivateAccount() {
  const { error } = await db.rpc("reactivate_my_account");
  if (error) throw error;
}

export async function resetRecommendations() {
  const { error } = await db.rpc("reset_my_recommendations");
  if (error) throw error;
}

export async function exportAccountData() {
  const { data, error } = await supabase.functions.invoke("export-account-data", { body: {} });
  if (error) throw error;
  return data;
}

export async function deleteAccountPermanently(confirmationEmail: string, confirmationPhrase: string) {
  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: { confirmationEmail, confirmationPhrase },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "La suppression du compte a échoué.");
}

export async function getBrowserStorageEstimate() {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usage: null as number | null, quota: null as number | null };
  }
  const estimate = await navigator.storage.estimate();
  return {
    usage: typeof estimate.usage === "number" ? estimate.usage : null,
    quota: typeof estimate.quota === "number" ? estimate.quota : null,
  };
}

export async function clearGlobeLinkCache() {
  if (typeof window === "undefined") return;

  const localKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (key.startsWith("globelink.") || key.startsWith("globelink-cache")) localKeys.push(key);
  }
  for (const key of localKeys) window.localStorage.removeItem(key);

  const sessionKeys: string[] = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith("globelink.")) sessionKeys.push(key);
  }
  for (const key of sessionKeys) window.sessionStorage.removeItem(key);

  if ("caches" in window) {
    const names = await window.caches.keys();
    await Promise.all(names.map((name) => window.caches.delete(name)));
  }

  await logSecurityEvent("cache_cleared", { local_entries: localKeys.length, session_entries: sessionKeys.length });
}
