import { supabase } from "@/integrations/supabase/client";

export const REACTIONS = [
  { key: "love", emoji: "❤️", label: "J'aime" },
  { key: "wow", emoji: "😮", label: "Wow" },
  { key: "haha", emoji: "😂", label: "Haha" },
  { key: "fire", emoji: "🔥", label: "Feu" },
  { key: "wanderlust", emoji: "🌍", label: "Wanderlust" },
  { key: "sad", emoji: "😢", label: "Triste" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

/** Find an existing 1:1 conversation between two users, or create one. */
export async function openOrCreateDirectConversation(currentUserId: string, otherUserId: string) {
  if (currentUserId === otherUserId) throw new Error("Impossible de s'écrire à soi-même");

  const rpcClient = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, string>,
    ) => Promise<{ data: string | null; error: { message: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc("open_or_create_direct_conversation", {
    _other_user_id: otherUserId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Création impossible");
  return data;
}

export async function toggleFollow(
  currentUserId: string,
  targetUserId: string,
  isFollowing: boolean,
) {
  const result = isFollowing
    ? await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", targetUserId)
    : await supabase
        .from("follows")
        .insert({ follower_id: currentUserId, following_id: targetUserId });
  if (result.error) throw result.error;
}

export async function setReaction(postId: string, userId: string, reaction: ReactionKey | null) {
  if (reaction === null) {
    const { error } = await supabase
      .from("post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("post_reactions")
    .upsert({ post_id: postId, user_id: userId, reaction }, { onConflict: "post_id,user_id" });
  if (error) throw error;
}
