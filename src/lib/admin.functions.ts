import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  moderationStatusFromAiReview,
  reviewPlaceWithAi,
  type SubmitPlaceInput,
} from "@/lib/place-moderation.functions";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function getAdminDb(ctx: { supabase: any }) {
  // Local/mobile launches may not have a server secret configured yet.
  // In that case the authenticated client is still safe here because every
  // handler first checks the admin role and Supabase RLS enforces the same rule.
  if (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as any;
  }
  return ctx.supabase as any;
}

async function audit(
  ctx: { supabase: any; userId: string },
  action: string,
  target_type?: string,
  target_id?: string,
  metadata: any = {},
) {
  const db = await getAdminDb(ctx);
  await db.from("admin_audit_log").insert({
    actor_id: ctx.userId,
    action,
    target_type: target_type ?? null,
    target_id: target_id ?? null,
    metadata,
  });
}

/** Platform analytics: user counts, content counts, growth */
export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const day = 24 * 60 * 60 * 1000;
    const since7 = new Date(Date.now() - 7 * day).toISOString();
    const since30 = new Date(Date.now() - 30 * day).toISOString();

    const count = async (table: string, filter?: (q: any) => any) => {
      let q: any = (supabaseAdmin as any).from(table).select("id", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count } = await q;
      return count ?? 0;
    };

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      totalPosts,
      posts7,
      posts30,
      totalComments,
      totalTrips,
      pendingPlaces,
      openReports,
      totalReports,
      totalAnnouncements,
      totalMessages,
    ] = await Promise.all([
      count("profiles"),
      count("profiles", (q) => q.eq("status", "active")),
      count("profiles", (q) => q.eq("status", "suspended")),
      count("profiles", (q) => q.eq("status", "banned")),
      count("posts"),
      count("posts", (q) => q.gte("created_at", since7)),
      count("posts", (q) => q.gte("created_at", since30)),
      count("comments"),
      count("trips"),
      count("places", (q) => q.in("moderation_status", ["pending", "ai_flagged"])),
      count("reports", (q) => q.eq("status", "open")),
      count("reports"),
      count("announcements"),
      count("messages"),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        banned: bannedUsers,
      },
      content: {
        posts: totalPosts,
        posts7d: posts7,
        posts30d: posts30,
        comments: totalComments,
        trips: totalTrips,
        messages: totalMessages,
        pendingPlaces,
      },
      reports: { open: openReports, total: totalReports },
      announcements: totalAnnouncements,
    };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const data = raw as { search?: string; status?: string; limit?: number };
    const search = String(data.search ?? "")
      .normalize("NFKC")
      .replace(/[%_(),]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const allowedStatuses = new Set(["all", "active", "suspended", "banned"]);
    const status = allowedStatuses.has(String(data.status)) ? String(data.status) : "all";
    const limit = Math.min(200, Math.max(1, Math.trunc(Number(data.limit ?? 100)) || 100));
    return { search, status, limit };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    let q = supabaseAdmin
      .from("profiles")
      .select(
        "id, username, display_name, avatar_url, status, created_at, followers_count, visibility, verified, featured, ai_access, ai_daily_limit",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search)
      q = q.or(`username.ilike.%${data.search}%,display_name.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Attach roles
    const ids = (rows ?? []).map((r: any) => r.id);
    const { data: roles } = ids.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as any[] };
    const byUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });

    const { data: subscriptions } = ids.length
      ? await supabaseAdmin
          .from("ai_subscriptions")
          .select("user_id, status, current_period_end")
          .in("user_id", ids)
      : { data: [] as any[] };
    const subscriptionByUser = new Map<string, any>();
    (subscriptions ?? []).forEach((row: any) => subscriptionByUser.set(row.user_id, row));

    const { data: earnedBadges } = ids.length
      ? await supabaseAdmin.from("user_badges").select("user_id, badge_id").in("user_id", ids)
      : { data: [] as any[] };
    const badgesByUser = new Map<string, string[]>();
    (earnedBadges ?? []).forEach((row: any) => {
      const current = badgesByUser.get(row.user_id) ?? [];
      current.push(row.badge_id);
      badgesByUser.set(row.user_id, current);
    });

    return (rows ?? []).map((r: any) => {
      const subscription = subscriptionByUser.get(r.id);
      const subscriptionActive =
        !!subscription &&
        ["active", "trialing"].includes(String(subscription.status)) &&
        (!subscription.current_period_end ||
          new Date(subscription.current_period_end).getTime() > Date.now());
      return {
        ...r,
        roles: byUser.get(r.id) ?? [],
        badges: badgesByUser.get(r.id) ?? [],
        ai_subscription_status: subscription?.status ?? "inactive",
        ai_subscription_active: subscriptionActive,
        ai_subscription_period_end: subscription?.current_period_end ?? null,
      };
    });
  });

export const adminSetUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { userId: string; status: "active" | "suspended" | "banned"; reason?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId)
      throw new Error("Impossible de modifier votre propre statut");
    const supabaseAdmin = await getAdminDb(context);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        status: data.status,
        status_reason: data.reason ?? null,
        status_updated_at: new Date().toISOString(),
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await audit(context, `user.${data.status}`, "profile", data.userId, { reason: data.reason });
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId)
      throw new Error("Impossible de supprimer votre propre compte");
    const supabaseAdmin = await getAdminDb(context);
    // Deleting an Auth identity requires the server-only service key.
    if (!(typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      throw new Error(
        "La suppression complète d’un compte nécessite la clé serveur. Relance CONFIGURER_AUTH_GOOGLE_EMAIL_ADMIN.bat.",
      );
    }
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    await audit(context, "user.delete", "profile", data.userId);
    return { ok: true };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { userId: string; role: "user" | "moderator" | "admin"; action: "grant" | "revoke" }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    if (data.action === "grant") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: data.userId, role: data.role, granted_by: context.userId },
          { onConflict: "user_id,role" },
        );
      if (error) throw new Error(error.message);
    } else {
      if (data.userId === context.userId && data.role === "admin") {
        throw new Error("Impossible de révoquer votre propre rôle admin");
      }
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await audit(context, `role.${data.action}`, "user_roles", data.userId, { role: data.role });
    return { ok: true };
  });

export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { status?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    let q = supabaseAdmin
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { id: string; status: "resolved" | "dismissed" | "reviewing"; note?: string }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { error } = await supabaseAdmin
      .from("reports")
      .update({
        status: data.status,
        resolution_note: data.note ?? null,
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, `report.${data.status}`, "report", data.id, { note: data.note });
    return { ok: true };
  });

export const adminDeleteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { targetType: "post" | "comment"; targetId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const table = data.targetType === "post" ? "posts" : "comments";
    const { error } = await supabaseAdmin.from(table).delete().eq("id", data.targetId);
    if (error) throw new Error(error.message);
    await audit(context, `content.delete`, data.targetType, data.targetId);
    return { ok: true };
  });

export const adminRecentContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { data: posts } = await supabaseAdmin
      .from("posts")
      .select(
        "id, caption, image_url, country_code, likes_count, created_at, user_id, profiles:user_id(username, display_name, avatar_url)",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    return posts ?? [];
  });

export const adminListAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { data } = await supabaseAdmin
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const adminUpsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id?: string;
      title: string;
      body: string;
      audience: "all" | "premium" | "moderators" | "admins";
      severity: "info" | "success" | "warning" | "critical";
      publish?: boolean;
      expiresAt?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const payload: any = {
      title: data.title,
      body: data.body,
      audience: data.audience,
      severity: data.severity,
      expires_at: data.expiresAt ?? null,
      published_at: data.publish ? new Date().toISOString() : null,
      author_id: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("announcements").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("announcements").insert(payload);
      if (error) throw new Error(error.message);
    }
    await audit(context, "announcement.upsert", "announcement", data.id ?? "new", {
      title: data.title,
    });
    return { ok: true };
  });

export const adminDeleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { error } = await supabaseAdmin.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, "announcement.delete", "announcement", data.id);
    return { ok: true };
  });

export const adminGetMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    return (data ?? []).map((r: any) => r.role as string);
  });

export const adminAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { data } = await supabaseAdmin
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

/** Bootstrap: the very first authenticated user can claim admin if no admin exists yet. */
export const adminClaimBootstrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const allowedBootstrapUser = process.env.ADMIN_BOOTSTRAP_USER_ID?.trim();
    if (!allowedBootstrapUser || allowedBootstrapUser !== context.userId) {
      throw new Error("Le bootstrap administrateur n'est pas autorisé pour ce compte.");
    }
    const supabaseAdmin = await getAdminDb(context);
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("Un administrateur existe déjà");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin", granted_by: context.userId });
    if (error) throw new Error(error.message);
    await audit(context, "role.bootstrap", "user_roles", context.userId, { role: "admin" });
    return { ok: true };
  });

const VISIBILITIES = new Set(["public", "limited", "hidden"]);
const AI_ACCESS_LEVELS = new Set(["free", "disabled"]);

export const adminSetUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const data = raw as {
      userId?: string;
      visibility?: string;
      verified?: boolean;
      featured?: boolean;
      aiAccess?: string;
      aiDailyLimit?: number;
    };
    const userId = String(data.userId ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)) throw new Error("Utilisateur invalide");
    const visibility = String(data.visibility ?? "public");
    const aiAccess = String(data.aiAccess ?? "free");
    if (!VISIBILITIES.has(visibility)) throw new Error("Visibilité invalide");
    if (!AI_ACCESS_LEVELS.has(aiAccess)) throw new Error("Niveau IA invalide");
    const aiDailyLimit = Math.trunc(Number(data.aiDailyLimit ?? 50));
    if (!Number.isFinite(aiDailyLimit) || aiDailyLimit < 1 || aiDailyLimit > 1000)
      throw new Error("Quota IA invalide");
    return {
      userId,
      visibility,
      verified: Boolean(data.verified),
      featured: Boolean(data.featured),
      aiAccess,
      aiDailyLimit,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        visibility: data.visibility,
        verified: data.verified,
        featured: data.featured,
        ai_access: data.aiAccess,
        ai_daily_limit: data.aiDailyLimit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await audit(context, "user.access.update", "profile", data.userId, {
      visibility: data.visibility,
      verified: data.verified,
      featured: data.featured,
      aiAccess: data.aiAccess,
      aiDailyLimit: data.aiDailyLimit,
    });
    return { ok: true };
  });

export const adminListBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { data, error } = await supabaseAdmin
      .from("badges")
      .select("id, label, description, emoji")
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminSetUserBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const data = raw as { userId?: string; badgeId?: string; action?: string };
    const userId = String(data.userId ?? "");
    const badgeId = String(data.badgeId ?? "")
      .trim()
      .slice(0, 80);
    const action = data.action === "revoke" ? "revoke" : "grant";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId) || !/^[a-z0-9_-]{2,80}$/i.test(badgeId)) {
      throw new Error("Badge ou utilisateur invalide");
    }
    return { userId, badgeId, action } as const;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    if (data.action === "grant") {
      const { error } = await supabaseAdmin.from("user_badges").upsert(
        {
          user_id: data.userId,
          badge_id: data.badgeId,
          earned_at: new Date().toISOString(),
        },
        { onConflict: "user_id,badge_id" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_badges")
        .delete()
        .eq("user_id", data.userId)
        .eq("badge_id", data.badgeId);
      if (error) throw new Error(error.message);
    }
    await audit(context, `badge.${data.action}`, "user_badges", data.userId, {
      badgeId: data.badgeId,
    });
    return { ok: true };
  });

/* ---------------- Community place moderation ---------------- */
const PLACE_REVIEW_STATUSES = new Set(["all", "awaiting", "approved", "rejected"]);
const PLACE_REVIEW_SELECT =
  "id,user_id,name,category,country,city,lat,lng,description,image_url,created_at,moderation_status,moderation_ai_score,moderation_ai_summary,moderation_ai_flags,moderation_ai_checked_at,moderation_reviewed_at,moderation_rejection_reason,profiles!places_user_id_profiles_fkey(username,display_name,avatar_url)";

function cleanModerationReason(value: unknown, max = 500) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/[<>`{}]/g, " ");
  return Array.from(normalized)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function getPrivatePlaceModerationDb() {
  if (typeof process === "undefined" || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "La modération IA privée nécessite SUPABASE_SERVICE_ROLE_KEY côté serveur. Lance CONFIGURER_PROJET_SUPABASE.bat et ajoute la clé serveur.",
    );
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function toPlaceReviewInput(place: any): SubmitPlaceInput {
  return {
    name: String(place.name ?? ""),
    category: String(place.category ?? ""),
    country: String(place.country ?? ""),
    city: place.city ? String(place.city) : null,
    description: place.description ? String(place.description) : null,
    lat: Number(place.lat),
    lng: Number(place.lng),
    imageUrl: place.image_url ? String(place.image_url) : null,
  };
}

async function fillMissingPlaceAiReviews(db: any, rows: any[]) {
  const candidates = rows
    .filter(
      (place) =>
        ["pending", "ai_flagged"].includes(String(place.moderation_status)) &&
        needsFreshPlaceAiReview(place),
    )
    .slice(0, 5);

  for (const place of candidates) {
    const aiReview = await reviewPlaceWithAi(toPlaceReviewInput(place));
    const now = new Date().toISOString();
    const payload = {
      moderation_status: moderationStatusFromAiReview(aiReview),
      moderation_ai_score: aiReview.score,
      moderation_ai_summary: aiReview.summary,
      moderation_ai_flags: aiReview.flags,
      moderation_ai_checked_at: now,
    };
    const { data: updated } = await db
      .from("places")
      .update(payload)
      .eq("id", place.id)
      .select(
        "moderation_status,moderation_ai_score,moderation_ai_summary,moderation_ai_flags,moderation_ai_checked_at",
      )
      .maybeSingle();
    Object.assign(place, updated ?? payload);
  }

  return rows;
}

function needsFreshPlaceAiReview(place: any) {
  const summary = String(place?.moderation_ai_summary ?? "");
  const flags = Array.isArray(place?.moderation_ai_flags) ? place.moderation_ai_flags : [];
  const hasRecommendation = flags.some((flag: unknown) =>
    ["recommandation_accepter", "recommandation_verifier", "recommandation_refuser"].includes(
      String(flag),
    ),
  );
  return (
    !summary ||
    !hasRecommendation ||
    summary.includes("modèle IA non configuré") ||
    summary.includes("modèle IA n'a pas répondu") ||
    summary.includes("Gemini est configuré, mais") ||
    flags.includes("modele_ia_indisponible") ||
    flags.includes("gemini_api_a_verifier") ||
    flags.includes("gemini_non_configure") ||
    flags.includes("gemini_cle_invalide")
  );
}

export const adminListPlaceReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const data = raw as { status?: string; search?: string; limit?: number };
    const status = PLACE_REVIEW_STATUSES.has(String(data.status))
      ? String(data.status)
      : "awaiting";
    const search = String(data.search ?? "")
      .normalize("NFKC")
      .replace(/[%_(),]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const limit = Math.min(300, Math.max(1, Math.trunc(Number(data.limit ?? 120)) || 120));
    return { status, search, limit };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await getPrivatePlaceModerationDb();
    let query: any = (db as any)
      .from("places")
      .select(PLACE_REVIEW_SELECT)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status === "awaiting") {
      query = query.in("moderation_status", ["pending", "ai_flagged"]);
    } else if (data.status === "all") {
      query = query.in("moderation_status", ["pending", "ai_flagged", "approved", "rejected"]);
    } else {
      query = query.eq("moderation_status", data.status);
    }
    if (data.search) {
      query = query.or(
        `name.ilike.%${data.search}%,city.ilike.%${data.search}%,country.ilike.%${data.search}%,category.ilike.%${data.search}%`,
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return fillMissingPlaceAiReviews(db, rows ?? []);
  });

export const adminModeratePlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const data = raw as { id?: string; action?: string; reason?: string };
    const id = String(data.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Lieu invalide");
    const action = data.action === "approve" ? "approve" : data.action === "reject" ? "reject" : "";
    if (!action) throw new Error("Action invalide");
    const reason = cleanModerationReason(data.reason);
    return { id, action, reason };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await getAdminDb(context);
    const now = new Date().toISOString();
    const payload =
      data.action === "approve"
        ? {
            moderation_status: "approved",
            moderation_reviewed_at: now,
            moderation_reviewed_by: context.userId,
            moderation_rejection_reason: null,
          }
        : {
            moderation_status: "rejected",
            moderation_reviewed_at: now,
            moderation_reviewed_by: context.userId,
            moderation_rejection_reason: data.reason || "Refusé par l'administration",
          };
    const { data: place, error } = await (db as any)
      .from("places")
      .update(payload)
      .eq("id", data.id)
      .select("id,name,moderation_status")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, `place.${data.action}`, "place", data.id, {
      name: place?.name,
      status: payload.moderation_status,
      reason: data.reason || null,
    });
    return { ok: true, place };
  });

/* ---------------- Internet catalog moderation ---------------- */
const CATALOG_KINDS = new Set(["all", "activity", "restaurant", "hotel", "deal"]);

export const adminListCatalogItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const data = raw as { kind?: string; search?: string; limit?: number };
    const kind = CATALOG_KINDS.has(String(data.kind)) ? String(data.kind) : "all";
    const search = String(data.search ?? "")
      .normalize("NFKC")
      .replace(/[%_(),]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const limit = Math.min(300, Math.max(1, Math.trunc(Number(data.limit ?? 120)) || 120));
    return { kind, search, limit };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    let query: any = (supabaseAdmin as any)
      .from("external_catalog_items")
      .select(
        "id,provider,external_id,kind,slug,title,description,category,city,country,image_url,source_url,booking_url,price_text,rating,fetched_at,valid_until,published,admin_hidden",
      )
      .order("fetched_at", { ascending: false })
      .limit(data.limit);
    if (data.kind !== "all") query = query.eq("kind", data.kind);
    if (data.search)
      query = query.or(
        `title.ilike.%${data.search}%,city.ilike.%${data.search}%,country.ilike.%${data.search}%,provider.ilike.%${data.search}%`,
      );
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminDeleteCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const data = raw as { id?: string; reason?: string };
    const id = String(data.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Élément invalide");
    return { id, reason: String(data.reason ?? "Supprimé par l’administration").slice(0, 300) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const db: any = supabaseAdmin as any;
    const { data: item, error: readError } = await db
      .from("external_catalog_items")
      .select("provider,external_id,kind,title")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!item) return { ok: true };

    const { error: blockError } = await db.from("external_catalog_blocks").upsert(
      {
        provider: item.provider,
        external_id: item.external_id,
        kind: item.kind,
        title: item.title,
        reason: data.reason,
        blocked_by: context.userId,
        blocked_at: new Date().toISOString(),
      },
      { onConflict: "provider,external_id" },
    );
    if (blockError) throw new Error(blockError.message);

    const { error: deleteError } = await db
      .from("external_catalog_items")
      .delete()
      .eq("id", data.id);
    if (deleteError) throw new Error(deleteError.message);
    await audit(context, "catalog.delete_and_block", "external_catalog_item", data.id, {
      provider: item.provider,
      externalId: item.external_id,
      kind: item.kind,
      title: item.title,
      reason: data.reason,
    });
    return { ok: true };
  });

export const adminListCatalogAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { data, error } = await (supabaseAdmin as any)
      .from("catalog_search_areas")
      .select("*")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertCatalogArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const input = raw as Record<string, unknown>;
    const city = String(input.city ?? "")
      .trim()
      .slice(0, 100);
    const country = String(input.country ?? "")
      .trim()
      .slice(0, 100);
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const radiusM = Math.min(
      25000,
      Math.max(1000, Math.trunc(Number(input.radiusM ?? 8000)) || 8000),
    );
    const priority = Math.min(1000, Math.max(1, Math.trunc(Number(input.priority ?? 100)) || 100));
    if (city.length < 2 || country.length < 2) throw new Error("Ville et pays requis");
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
      throw new Error("Latitude invalide");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      throw new Error("Longitude invalide");
    const id = input.id ? String(input.id) : undefined;
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Zone invalide");
    return {
      id,
      city,
      country,
      countryCode:
        String(input.countryCode ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 2) || null,
      iataCode:
        String(input.iataCode ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 3) || null,
      latitude,
      longitude,
      radiusM,
      priority,
      enabled: input.enabled !== false,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const db: any = supabaseAdmin as any;
    const payload = {
      city: data.city,
      country: data.country,
      country_code: data.countryCode,
      iata_code: data.iataCode,
      latitude: data.latitude,
      longitude: data.longitude,
      radius_m: data.radiusM,
      priority: data.priority,
      enabled: data.enabled,
    };
    const result = data.id
      ? await db.from("catalog_search_areas").update(payload).eq("id", data.id)
      : await db.from("catalog_search_areas").insert(payload);
    if (result.error) throw new Error(result.error.message);
    await audit(context, "catalog.area.upsert", "catalog_search_area", data.id ?? "new", payload);
    return { ok: true };
  });

export const adminDeleteCatalogArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const id = String((raw as { id?: string }).id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Zone invalide");
    return { id };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { error } = await (supabaseAdmin as any)
      .from("catalog_search_areas")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, "catalog.area.delete", "catalog_search_area", data.id);
    return { ok: true };
  });

export const adminListCatalogSyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const supabaseAdmin = await getAdminDb(context);
    const { data, error } = await (supabaseAdmin as any)
      .from("catalog_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminTriggerCatalogSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.functions.invoke("sync-travel-catalog", {
      body: { force: true, triggerSource: "admin" },
    });
    if (error) throw new Error(error.message);
    if (data?.ok === false) throw new Error(data.error ?? "La synchronisation a échoué");
    await audit(
      context,
      "catalog.sync.manual",
      "catalog_sync_run",
      data?.runId ?? "manual",
      data ?? {},
    );
    return data ?? { ok: true };
  });

export const adminConfigureCatalogCron = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const schedule = String((raw as { schedule?: string })?.schedule ?? "15 4 * * *").trim();
    if (!/^[0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+$/.test(schedule))
      throw new Error("Planning cron invalide");
    return { schedule };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: result, error } = await context.supabase.functions.invoke("sync-travel-catalog", {
      body: { action: "configure-cron", schedule: data.schedule },
    });
    if (error) throw new Error(error.message);
    if (result?.ok === false || result?.error)
      throw new Error(result.error ?? "Configuration impossible");
    await audit(
      context,
      "catalog.cron.configure",
      "catalog_sync",
      String(result?.jobId ?? "daily"),
      { schedule: data.schedule },
    );
    return result ?? { ok: true };
  });
