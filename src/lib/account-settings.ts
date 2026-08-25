import { supabase } from "@/integrations/supabase/client";

export type MessagePermission = "everyone" | "following" | "matches" | "nobody";
export type RelationshipMode = "blocked" | "restricted";
export type PreferredBudget = "budget" | "balanced" | "comfort" | "premium";

export type AccountSettings = {
  message_permission: MessagePermission;
  allow_comments: boolean;
  allow_mentions: boolean;
  travel_match_enabled: boolean;
  travel_match_verified_only: boolean;
  travel_match_age_min: number;
  travel_match_age_max: number;
  preferred_budget: PreferredBudget;
  preferred_currency: string;
  travel_interests: string[];
  use_location: boolean;
  precise_location: boolean;
  map_hotels: boolean;
  map_restaurants: boolean;
  map_activities: boolean;
  map_offers: boolean;
};

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  message_permission: "everyone",
  allow_comments: true,
  allow_mentions: true,
  travel_match_enabled: true,
  travel_match_verified_only: false,
  travel_match_age_min: 18,
  travel_match_age_max: 99,
  preferred_budget: "balanced",
  preferred_currency: "EUR",
  travel_interests: [],
  use_location: false,
  precise_location: false,
  map_hotels: true,
  map_restaurants: true,
  map_activities: true,
  map_offers: true,
};

const db = supabase as any;

function normalizeSettings(row: Record<string, unknown> | null | undefined): AccountSettings {
  if (!row) return { ...DEFAULT_ACCOUNT_SETTINGS };
  return {
    ...DEFAULT_ACCOUNT_SETTINGS,
    ...row,
    travel_match_age_min: Number(row.travel_match_age_min ?? 18),
    travel_match_age_max: Number(row.travel_match_age_max ?? 99),
    travel_interests: Array.isArray(row.travel_interests) ? (row.travel_interests as string[]) : [],
  };
}

export async function getAccountSettings(userId: string): Promise<AccountSettings> {
  const { data, error } = await db
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return normalizeSettings(data);
}

export async function saveAccountSettings(userId: string, settings: AccountSettings) {
  const minAge = Math.max(18, Math.min(99, Math.round(settings.travel_match_age_min)));
  const maxAge = Math.max(minAge, Math.min(99, Math.round(settings.travel_match_age_max)));
  const payload: AccountSettings = {
    ...settings,
    travel_match_age_min: minAge,
    travel_match_age_max: maxAge,
    preferred_currency: settings.preferred_currency.trim().toUpperCase().slice(0, 3) || "EUR",
    travel_interests: settings.travel_interests.map((item) => item.trim()).filter(Boolean).slice(0, 20),
  };

  const { error } = await db.from("user_settings").upsert(
    {
      user_id: userId,
      ...payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;

  if (!payload.travel_match_enabled) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: intentError } = await db
      .from("travel_intents")
      .update({ visibility: "private", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .gte("ends_on", today)
      .eq("visibility", "public");
    if (intentError) throw intentError;
  }

  return payload;
}

export type RelationshipControl = {
  target_id: string;
  mode: RelationshipMode;
  created_at: string;
  profile?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export async function listRelationshipControls(userId: string): Promise<RelationshipControl[]> {
  const { data, error } = await db
    .from("user_relationship_controls")
    .select("target_id, mode, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RelationshipControl[];
  const ids = [...new Set(rows.map((row) => row.target_id))];
  if (!ids.length) return rows;

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  if (profileError) throw profileError;
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return rows.map((row) => ({ ...row, profile: byId.get(row.target_id) ?? null }));
}

export async function setRelationshipControl(
  ownerId: string,
  targetId: string,
  mode: RelationshipMode,
) {
  if (ownerId === targetId) throw new Error("Tu ne peux pas appliquer ce réglage à ton propre compte.");
  const { error } = await db.from("user_relationship_controls").upsert(
    {
      owner_id: ownerId,
      target_id: targetId,
      mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,target_id" },
  );
  if (error) throw error;
}

export async function removeRelationshipControl(ownerId: string, targetId: string) {
  const { error } = await db
    .from("user_relationship_controls")
    .delete()
    .eq("owner_id", ownerId)
    .eq("target_id", targetId);
  if (error) throw error;
}

export async function searchProfilesForControl(userId: string, term: string) {
  const q = term.trim().replace(/^@/, "");
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, verified")
    .eq("status", "active")
    .neq("visibility", "hidden")
    .neq("id", userId)
    .or(`username.ilike.${like},display_name.ilike.${like}`)
    .limit(8);
  if (error) throw error;
  return data ?? [];
}

export async function getUnavailableUserIds(): Promise<Set<string>> {
  const rpcClient = supabase as unknown as {
    rpc: (
      name: string,
      args?: Record<string, never>,
    ) => Promise<{ data: Array<{ user_id: string }> | null; error: { message: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc("get_unavailable_user_ids");
  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.user_id));
}

export async function getSuggestionExcludedUserIds(userId: string): Promise<Set<string>> {
  const [unavailable, controls] = await Promise.all([
    getUnavailableUserIds(),
    db
      .from("user_relationship_controls")
      .select("target_id")
      .eq("owner_id", userId)
      .in("mode", ["blocked", "restricted"]),
  ]);
  for (const row of controls.data ?? []) unavailable.add(row.target_id);
  return unavailable;
}
