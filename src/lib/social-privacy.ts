import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type SocialPermission = "everyone" | "following" | "nobody";
export type StoryAudience = "followers" | "close_friends";

export type SocialPrivacySettings = {
  mention_permission: SocialPermission;
  tag_permission: SocialPermission;
  manual_tag_approval: boolean;
  allow_message_requests: boolean;
  filter_offensive_comments: boolean;
  hidden_words: string[];
  show_activity_status: boolean;
  story_default_audience: StoryAudience;
};

export const DEFAULT_SOCIAL_PRIVACY_SETTINGS: SocialPrivacySettings = {
  mention_permission: "everyone",
  tag_permission: "everyone",
  manual_tag_approval: false,
  allow_message_requests: true,
  filter_offensive_comments: true,
  hidden_words: [],
  show_activity_status: true,
  story_default_audience: "followers",
};

export type SocialProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export async function getSocialPrivacySettings(userId: string): Promise<SocialPrivacySettings> {
  const { data, error } = await db
    .from("user_settings")
    .select(
      "mention_permission,tag_permission,manual_tag_approval,allow_message_requests,filter_offensive_comments,hidden_words,show_activity_status,story_default_audience",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return {
    ...DEFAULT_SOCIAL_PRIVACY_SETTINGS,
    ...(data ?? {}),
    hidden_words: Array.isArray(data?.hidden_words) ? data.hidden_words : [],
  };
}

export async function saveSocialPrivacySettings(userId: string, settings: SocialPrivacySettings) {
  const payload = {
    ...settings,
    hidden_words: settings.hidden_words
      .map((word) => word.trim().toLowerCase())
      .filter((word, index, all) => word.length >= 2 && all.indexOf(word) === index)
      .slice(0, 50),
  };
  const { error } = await db.from("user_settings").upsert(
    { user_id: userId, ...payload, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  return payload as SocialPrivacySettings;
}

async function profilesForIds(ids: string[]): Promise<SocialProfile[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .in("id", [...new Set(ids)]);
  if (error) throw error;
  return (data ?? []) as SocialProfile[];
}

export async function searchRelationshipProfiles(userId: string, term: string) {
  const needle = term.trim().replace(/^@/, "").toLowerCase();
  if (needle.length < 2) return [] as SocialProfile[];
  const [followers, following] = await Promise.all([
    supabase.from("follows").select("follower_id").eq("following_id", userId).limit(500),
    supabase.from("follows").select("following_id").eq("follower_id", userId).limit(500),
  ]);
  const ids = [
    ...(followers.data ?? []).map((row) => row.follower_id),
    ...(following.data ?? []).map((row) => row.following_id),
  ].filter((id) => id !== userId);
  const profiles = await profilesForIds(ids);
  return profiles
    .filter((profile) =>
      `${profile.username} ${profile.display_name ?? ""}`.toLowerCase().includes(needle),
    )
    .slice(0, 12);
}

export async function searchMuteProfiles(userId: string, term: string) {
  const needle = term.trim().replace(/^@/, "");
  if (needle.length < 2) return [] as SocialProfile[];
  const like = `%${needle}%`;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,display_name,avatar_url")
    .eq("status", "active")
    .neq("id", userId)
    .neq("visibility", "hidden")
    .or(`username.ilike.${like},display_name.ilike.${like}`)
    .limit(12);
  if (error) throw error;
  return (data ?? []) as SocialProfile[];
}

export type ManagedProfile = SocialProfile & {
  mute_posts?: boolean;
  mute_stories?: boolean;
};

export async function listMutedProfiles(userId: string): Promise<ManagedProfile[]> {
  const { data, error } = await db
    .from("user_mutes")
    .select("target_id,mute_posts,mute_stories")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const profiles = await profilesForIds(rows.map((row: any) => row.target_id));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows.flatMap((row: any) => {
    const profile = byId.get(row.target_id);
    return profile ? [{ ...profile, mute_posts: row.mute_posts, mute_stories: row.mute_stories }] : [];
  });
}

export async function setMute(
  userId: string,
  targetId: string,
  options: { mute_posts: boolean; mute_stories: boolean },
) {
  if (userId === targetId) throw new Error("Impossible de mettre ton propre compte en sourdine.");
  const { error } = await db.from("user_mutes").upsert(
    { owner_id: userId, target_id: targetId, ...options, updated_at: new Date().toISOString() },
    { onConflict: "owner_id,target_id" },
  );
  if (error) throw error;
}

export async function removeMute(userId: string, targetId: string) {
  const { error } = await db.from("user_mutes").delete().eq("owner_id", userId).eq("target_id", targetId);
  if (error) throw error;
}

export async function getMutedUserIds(userId: string, kind: "posts" | "stories") {
  const column = kind === "posts" ? "mute_posts" : "mute_stories";
  const { data, error } = await db
    .from("user_mutes")
    .select("target_id")
    .eq("owner_id", userId)
    .eq(column, true);
  if (error) return new Set<string>();
  return new Set<string>((data ?? []).map((row: any) => row.target_id));
}

async function listSimpleAudience(
  table: "close_friends" | "story_hidden_accounts",
  ownerId: string,
  idColumn: "friend_id" | "target_id",
) {
  const { data, error } = await db.from(table).select(idColumn).eq("owner_id", ownerId);
  if (error) throw error;
  return profilesForIds((data ?? []).map((row: any) => row[idColumn]));
}

export function listCloseFriends(userId: string) {
  return listSimpleAudience("close_friends", userId, "friend_id");
}

export function listStoryHiddenAccounts(userId: string) {
  return listSimpleAudience("story_hidden_accounts", userId, "target_id");
}

export async function setCloseFriend(userId: string, friendId: string, enabled: boolean) {
  const query = db.from("close_friends");
  const result = enabled
    ? await query.upsert({ owner_id: userId, friend_id: friendId }, { onConflict: "owner_id,friend_id" })
    : await query.delete().eq("owner_id", userId).eq("friend_id", friendId);
  if (result.error) throw result.error;
}

export async function setStoryHidden(userId: string, targetId: string, enabled: boolean) {
  const query = db.from("story_hidden_accounts");
  const result = enabled
    ? await query.upsert({ owner_id: userId, target_id: targetId }, { onConflict: "owner_id,target_id" })
    : await query.delete().eq("owner_id", userId).eq("target_id", targetId);
  if (result.error) throw result.error;
}

export async function createPostTagsFromUsernames(
  userId: string,
  postId: string,
  rawUsernames: string,
) {
  const usernames = [...new Set(
    rawUsernames
      .split(/[\s,]+/)
      .map((value) => value.trim().replace(/^@/, "").toLowerCase())
      .filter((value) => /^[a-z0-9_.]{3,30}$/.test(value)),
  )].slice(0, 20);
  if (!usernames.length) return [];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,username")
    .in("username", usernames);
  if (profileError) throw profileError;
  const found = profiles ?? [];
  const missing = usernames.filter((username) => !found.some((profile) => profile.username === username));
  if (missing.length) throw new Error(`Compte introuvable : @${missing[0]}`);
  const { data, error } = await db
    .from("post_tags")
    .insert(found.map((profile) => ({ post_id: postId, tagged_user_id: profile.id, tagger_id: userId })))
    .select("tagged_user_id,status");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type MessageRequest = {
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export async function getMessageRequest(conversationId: string): Promise<MessageRequest | null> {
  const { data, error } = await db
    .from("conversation_requests")
    .select("conversation_id,sender_id,recipient_id,status,created_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function listIncomingMessageRequests(userId: string): Promise<MessageRequest[]> {
  const { data, error } = await db
    .from("conversation_requests")
    .select("conversation_id,sender_id,recipient_id,status,created_at")
    .eq("recipient_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function respondToMessageRequest(
  conversationId: string,
  action: "accepted" | "declined",
) {
  const { error } = await db.rpc("respond_to_message_request", {
    _conversation_id: conversationId,
    _action: action,
  });
  if (error) throw new Error(error.message);
}

export async function listPendingPostTags(userId: string) {
  const { data, error } = await db
    .from("post_tags")
    .select("post_id,tagger_id,status,created_at")
    .eq("tagged_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const profiles = await profilesForIds(rows.map((row: any) => row.tagger_id));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows.map((row: any) => ({ ...row, profile: byId.get(row.tagger_id) ?? null }));
}

export async function respondToPostTag(postId: string, action: "approved" | "declined") {
  const { error } = await db.rpc("respond_to_post_tag", { _post_id: postId, _action: action });
  if (error) throw new Error(error.message);
}

export async function heartbeatPresence(userId: string) {
  const now = new Date().toISOString();
  const { error } = await db.from("user_presence").upsert(
    { user_id: userId, last_seen_at: now, updated_at: now },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function getPresence(userId: string) {
  const { data, error } = await db
    .from("user_presence")
    .select("last_seen_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data?.last_seen_at ? new Date(data.last_seen_at) : null;
}
