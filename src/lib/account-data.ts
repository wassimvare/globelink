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
  const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession();
  if (currentSessionError) throw currentSessionError;
  if (!currentSession.session) {
    throw new Error("Ta session a expiré. Reconnecte-toi puis réessaie.");
  }

  // Force a fresh access token before this sensitive operation. This avoids
  // sending an access token that was signed by an older Supabase JWT signing key.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession(
    currentSession.session,
  );

  if (refreshError || !refreshed.session?.access_token) {
    throw new Error(
      "Ta session n’est plus valide. Déconnecte-toi puis reconnecte-toi avant de supprimer le compte.",
    );
  }

  const accessToken = refreshed.session.access_token;

  // Verify the freshly issued token against the same Auth project before
  // calling the destructive Edge Function.
  const { data: userCheck, error: userCheckError } = await supabase.auth.getUser(accessToken);
  if (userCheckError || !userCheck.user) {
    throw new Error(
      "Impossible de valider ta nouvelle session. Déconnecte-toi puis reconnecte-toi avant de réessayer.",
    );
  }

  const response = await fetch(
    "https://hzsfocphpynxoykfkfaj.supabase.co/functions/v1/delete-account",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: "sb_publishable_9Vrha4s7e7HJTQ3euKQyAA_lGjAaSh7",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ confirmationEmail, confirmationPhrase }),
    },
  );

  let payload: { ok?: boolean; error?: string; message?: string; step?: string } = {};
  try {
    payload = await response.json();
  } catch {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Suppression impossible (HTTP ${response.status}).`);
  }

  if (!response.ok || !payload.ok) {
    const detail = payload.error || payload.message || `Suppression impossible (HTTP ${response.status}).`;
    throw new Error(payload.step ? `Étape ${payload.step} : ${detail}` : detail);
  }
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
