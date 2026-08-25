import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type ActivityPost = {
  id: string;
  user_id: string;
  caption: string | null;
  image_url: string | null;
  video_url: string | null;
  country: string | null;
  city: string | null;
  created_at: string;
};

export type ActivityStory = {
  id: string;
  user_id: string;
  media_url: string | null;
  poster_url: string | null;
  media_chunks: string[] | null;
  media_type: string;
  audience: string | null;
  created_at: string;
  expires_at: string;
  story_group_id: string | null;
};

export type ActivityProfile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
};

export type ActivityData = {
  posts: ActivityPost[];
  stories: ActivityStory[];
  likes: Array<{ post_id: string; created_at: string }>;
  reactions: Array<{ id: string; post_id: string; reaction: string; created_at: string }>;
  saves: Array<{ post_id: string; created_at: string }>;
  comments: Array<{ id: string; post_id: string; content: string; created_at: string }>;
  storyLikes: Array<{ id: string; story_id: string; created_at: string }>;
  matchLikes: Array<{ id: string; to_user_id: string; created_at: string }>;
  matchPasses: Array<{ id: string; target_id: string; created_at: string }>;
  trips: Array<{
    id: string;
    title: string;
    country: string | null;
    city: string | null;
    cover_url: string | null;
    starts_on: string | null;
    ends_on: string | null;
    status: string | null;
    created_at: string;
  }>;
  travelIntents: Array<{
    id: string;
    destination_country: string;
    destination_city: string | null;
    starts_on: string;
    ends_on: string;
    visibility: string;
    created_at: string;
  }>;
  searches: Array<{
    id: string;
    query: string;
    search_count: number;
    created_at: string;
    last_searched_at: string;
  }>;
  referencedPosts: Record<string, ActivityPost>;
  profiles: Record<string, ActivityProfile>;
};

async function rows<T>(promise: Promise<any>): Promise<T[]> {
  const { data, error } = await promise;
  if (error) throw error;
  return (data ?? []) as T[];
}

export async function recordSearchHistory(query: string) {
  const cleaned = query.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2 || cleaned.length > 200) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await db.rpc("record_search_history", { _query: cleaned });
  if (error) console.warn("Search history was not recorded", error.message);
}

export async function loadActivityData(userId: string): Promise<ActivityData> {
  const [
    posts,
    stories,
    likes,
    reactions,
    saves,
    comments,
    storyLikes,
    matchLikes,
    matchPasses,
    trips,
    travelIntents,
    searches,
  ] = await Promise.all([
    rows<ActivityPost>(
      db
        .from("posts")
        .select("id,user_id,caption,image_url,video_url,country,city,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
    rows<ActivityStory>(
      db
        .from("stories")
        .select("id,user_id,media_url,poster_url,media_chunks,media_type,audience,created_at,expires_at,story_group_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(150),
    ),
    rows<{ post_id: string; created_at: string }>(
      db.from("post_likes").select("post_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(150),
    ),
    rows<{ id: string; post_id: string; reaction: string; created_at: string }>(
      db.from("post_reactions").select("id,post_id,reaction,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(150),
    ),
    rows<{ post_id: string; created_at: string }>(
      db.from("post_saves").select("post_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(150),
    ),
    rows<{ id: string; post_id: string; content: string; created_at: string }>(
      db.from("comments").select("id,post_id,content,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(150),
    ),
    rows<{ id: string; story_id: string; created_at: string }>(
      db.from("story_likes").select("id,story_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(150),
    ),
    rows<{ id: string; to_user_id: string; created_at: string }>(
      db.from("match_likes").select("id,to_user_id,created_at").eq("from_user_id", userId).order("created_at", { ascending: false }).limit(150),
    ),
    rows<{ id: string; target_id: string; created_at: string }>(
      db.from("match_passes").select("id,target_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(150),
    ),
    rows<ActivityData["trips"][number]>(
      db.from("trips").select("id,title,country,city,cover_url,starts_on,ends_on,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    ),
    rows<ActivityData["travelIntents"][number]>(
      db.from("travel_intents").select("id,destination_country,destination_city,starts_on,ends_on,visibility,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
    ),
    rows<ActivityData["searches"][number]>(
      db.from("search_history").select("id,query,search_count,created_at,last_searched_at").eq("user_id", userId).order("last_searched_at", { ascending: false }).limit(100),
    ),
  ]);

  const referencedPostIds = Array.from(
    new Set([
      ...likes.map((row) => row.post_id),
      ...reactions.map((row) => row.post_id),
      ...saves.map((row) => row.post_id),
      ...comments.map((row) => row.post_id),
    ]),
  );
  const referencedPostRows = referencedPostIds.length
    ? await rows<ActivityPost>(
        db
          .from("posts")
          .select("id,user_id,caption,image_url,video_url,country,city,created_at")
          .in("id", referencedPostIds),
      )
    : [];

  const profileIds = Array.from(
    new Set([
      ...referencedPostRows.map((post) => post.user_id),
      ...matchLikes.map((row) => row.to_user_id),
      ...matchPasses.map((row) => row.target_id),
    ]),
  );
  const profileRows = profileIds.length
    ? await rows<ActivityProfile>(
        db
          .from("profiles")
          .select("id,username,display_name,avatar_url,country")
          .in("id", profileIds),
      )
    : [];

  return {
    posts,
    stories,
    likes,
    reactions,
    saves,
    comments,
    storyLikes,
    matchLikes,
    matchPasses,
    trips,
    travelIntents,
    searches,
    referencedPosts: Object.fromEntries(referencedPostRows.map((post) => [post.id, post])),
    profiles: Object.fromEntries(profileRows.map((profile) => [profile.id, profile])),
  };
}

export async function removePostLike(userId: string, postId: string) {
  const { error } = await db.from("post_likes").delete().eq("user_id", userId).eq("post_id", postId);
  if (error) throw error;
}

export async function removePostReaction(userId: string, reactionId: string) {
  const { error } = await db.from("post_reactions").delete().eq("user_id", userId).eq("id", reactionId);
  if (error) throw error;
}

export async function removeSavedPost(userId: string, postId: string) {
  const { error } = await db.from("post_saves").delete().eq("user_id", userId).eq("post_id", postId);
  if (error) throw error;
}

export async function deleteOwnComment(userId: string, commentId: string) {
  const { error } = await db.from("comments").delete().eq("user_id", userId).eq("id", commentId);
  if (error) throw error;
}

export async function removeMatchLike(userId: string, id: string) {
  const { error } = await db.from("match_likes").delete().eq("from_user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function removeMatchPass(userId: string, id: string) {
  const { error } = await db.from("match_passes").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function removeSearchHistoryItem(userId: string, id: string) {
  const { error } = await db.from("search_history").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export type ActivityClearSection = "likes" | "saved" | "comments" | "travel_match" | "searches";

export async function clearActivitySection(userId: string, section: ActivityClearSection) {
  let requests: Promise<any>[] = [];
  if (section === "likes") {
    requests = [
      db.from("post_likes").delete().eq("user_id", userId),
      db.from("post_reactions").delete().eq("user_id", userId),
      db.from("story_likes").delete().eq("user_id", userId),
      db.from("comment_likes").delete().eq("user_id", userId),
    ];
  } else if (section === "saved") {
    requests = [db.from("post_saves").delete().eq("user_id", userId)];
  } else if (section === "comments") {
    requests = [db.from("comments").delete().eq("user_id", userId)];
  } else if (section === "travel_match") {
    requests = [
      db.from("match_likes").delete().eq("from_user_id", userId),
      db.from("match_passes").delete().eq("user_id", userId),
    ];
  } else if (section === "searches") {
    requests = [db.from("search_history").delete().eq("user_id", userId)];
  }

  const results = await Promise.all(requests);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

function collectStoragePaths(...values: Array<string | string[] | null | undefined>) {
  const paths = new Set<string>();
  for (const value of values) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const path = item?.trim();
      if (!path || /^https?:\/\//i.test(path) || path.startsWith("blob:")) continue;
      paths.add(path);
    }
  }
  return [...paths];
}

async function removeStoragePaths(paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from("media").remove(paths);
  if (error) console.warn("Some activity media could not be removed", error.message);
}

export async function deleteOwnedPost(userId: string, postId: string) {
  const [{ data: post, error: postReadError }, { data: mediaRows, error: mediaReadError }] = await Promise.all([
    db.from("posts").select("image_url,video_url").eq("id", postId).eq("user_id", userId).maybeSingle(),
    db.from("post_media").select("url,media_chunks").eq("post_id", postId),
  ]);
  if (postReadError) throw postReadError;
  if (mediaReadError) throw mediaReadError;

  const paths = collectStoragePaths(
    post?.image_url,
    post?.video_url,
    ...(mediaRows ?? []).flatMap((row: any) => [row.url, ...(row.media_chunks ?? [])]),
  );
  const { error } = await db.from("posts").delete().eq("id", postId).eq("user_id", userId);
  if (error) throw error;
  await removeStoragePaths(paths);
}

export async function deleteAllOwnedPosts(userId: string) {
  const posts = await rows<{ id: string; image_url: string | null; video_url: string | null }>(
    db.from("posts").select("id,image_url,video_url").eq("user_id", userId),
  );
  if (!posts.length) return;
  const ids = posts.map((post) => post.id);
  const mediaRows = await rows<{ url: string; media_chunks: string[] | null }>(
    db.from("post_media").select("url,media_chunks").in("post_id", ids),
  );
  const paths = collectStoragePaths(
    ...posts.flatMap((post) => [post.image_url, post.video_url]),
    ...mediaRows.flatMap((row) => [row.url, ...(row.media_chunks ?? [])]),
  );
  const { error } = await db.from("posts").delete().eq("user_id", userId);
  if (error) throw error;
  await removeStoragePaths(paths);
}

export async function deleteOwnedStory(userId: string, storyId: string) {
  const { data: story, error: readError } = await db
    .from("stories")
    .select("media_url,poster_url,media_chunks")
    .eq("id", storyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  const paths = collectStoragePaths(story?.media_url, story?.poster_url, story?.media_chunks ?? []);
  const { error } = await db.from("stories").delete().eq("id", storyId).eq("user_id", userId);
  if (error) throw error;
  await removeStoragePaths(paths);
}

export async function deleteOwnedStories(userId: string, expiredOnly = false) {
  let request = db
    .from("stories")
    .select("id,media_url,poster_url,media_chunks,expires_at")
    .eq("user_id", userId);
  if (expiredOnly) request = request.lt("expires_at", new Date().toISOString());
  const stories = await rows<{ id: string; media_url: string | null; poster_url: string | null; media_chunks: string[] | null }>(request);
  if (!stories.length) return 0;

  const paths = collectStoragePaths(
    ...stories.flatMap((story) => [story.media_url, story.poster_url, ...(story.media_chunks ?? [])]),
  );
  const ids = stories.map((story) => story.id);
  const { error } = await db.from("stories").delete().eq("user_id", userId).in("id", ids);
  if (error) throw error;
  await removeStoragePaths(paths);
  return stories.length;
}
