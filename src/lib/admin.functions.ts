import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function audit(actorId: string, action: string, target_type?: string, target_id?: string, metadata: any = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: actorId, action, target_type: target_type ?? null,
    target_id: target_id ?? null, metadata,
  });
}

/** Platform analytics: user counts, content counts, growth */
export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const day = 24 * 60 * 60 * 1000;
    const since7 = new Date(Date.now() - 7 * day).toISOString();
    const since30 = new Date(Date.now() - 30 * day).toISOString();

    const count = async (table: string, filter?: (q: any) => any) => {
      let q: any = (supabaseAdmin as any).from(table).select("id", { count: "exact", head: true });
      if (filter) q = filter(q);
      const { count } = await q;
      return count ?? 0;
    };

    const [totalUsers, activeUsers, suspendedUsers, bannedUsers, demoUsers,
           totalPosts, posts7, posts30, totalComments, totalTrips,
           openReports, totalReports, totalAnnouncements, totalMessages] = await Promise.all([
      count("profiles"),
      count("profiles", (q) => q.eq("status", "active")),
      count("profiles", (q) => q.eq("status", "suspended")),
      count("profiles", (q) => q.eq("status", "banned")),
      count("profiles", (q) => q.eq("is_demo", true)),
      count("posts"),
      count("posts", (q) => q.gte("created_at", since7)),
      count("posts", (q) => q.gte("created_at", since30)),
      count("comments"),
      count("trips"),
      count("reports", (q) => q.eq("status", "open")),
      count("reports"),
      count("announcements"),
      count("messages"),
    ]);

    return {
      users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, banned: bannedUsers, demo: demoUsers },
      content: { posts: totalPosts, posts7d: posts7, posts30d: posts30, comments: totalComments, trips: totalTrips, messages: totalMessages },
      reports: { open: openReports, total: totalReports },
      announcements: totalAnnouncements,
    };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, avatar_url, status, is_demo, created_at, followers_count, visibility, verified, featured, ai_access, ai_daily_limit")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.or(`username.ilike.%${data.search}%,display_name.ilike.%${data.search}%`);
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

    const { data: earnedBadges } = ids.length
      ? await supabaseAdmin.from("user_badges").select("user_id, badge_id").in("user_id", ids)
      : { data: [] as any[] };
    const badgesByUser = new Map<string, string[]>();
    (earnedBadges ?? []).forEach((row: any) => {
      const current = badgesByUser.get(row.user_id) ?? [];
      current.push(row.badge_id);
      badgesByUser.set(row.user_id, current);
    });

    return (rows ?? []).map((r: any) => ({
      ...r,
      roles: byUser.get(r.id) ?? [],
      badges: badgesByUser.get(r.id) ?? [],
    }));
  });

export const adminSetUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; status: "active" | "suspended" | "banned"; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Impossible de modifier votre propre statut");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status, status_reason: data.reason ?? null, status_updated_at: new Date().toISOString() })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await audit(context.userId, `user.${data.status}`, "profile", data.userId, { reason: data.reason });
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Impossible de supprimer votre propre compte");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Try Auth Admin API (real users). Ignore error for demo profiles (no auth.users row).
    await supabaseAdmin.auth.admin.deleteUser(data.userId).catch(() => {});
    // Ensure profile row is gone too (demo profiles have no FK to auth.users).
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    await audit(context.userId, "user.delete", "profile", data.userId);
    return { ok: true };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "user" | "moderator" | "admin"; action: "grant" | "revoke" }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "grant") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role, granted_by: context.userId }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      if (data.userId === context.userId && data.role === "admin") {
        throw new Error("Impossible de révoquer votre propre rôle admin");
      }
      const { error } = await supabaseAdmin.from("user_roles").delete()
        .eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await audit(context.userId, `role.${data.action}`, "user_roles", data.userId, { role: data.role });
    return { ok: true };
  });

export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("reports").select("*").order("created_at", { ascending: false }).limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "resolved" | "dismissed" | "reviewing"; note?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("reports").update({
      status: data.status,
      resolution_note: data.note ?? null,
      resolved_by: context.userId,
      resolved_at: new Date().toISOString(),
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, `report.${data.status}`, "report", data.id, { note: data.note });
    return { ok: true };
  });

export const adminDeleteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { targetType: "post" | "comment"; targetId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.targetType === "post" ? "posts" : "comments";
    const { error } = await supabaseAdmin.from(table).delete().eq("id", data.targetId);
    if (error) throw new Error(error.message);
    await audit(context.userId, `content.delete`, data.targetType, data.targetId);
    return { ok: true };
  });

export const adminRecentContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: posts } = await supabaseAdmin
      .from("posts")
      .select("id, caption, image_url, country_code, likes_count, created_at, user_id, profiles:user_id(username, display_name, avatar_url)")
      .order("created_at", { ascending: false }).limit(50);
    return posts ?? [];
  });

export const adminListAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("announcements").select("*")
      .order("created_at", { ascending: false }).limit(100);
    return data ?? [];
  });

export const adminUpsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; title: string; body: string;
    audience: "all" | "premium" | "moderators" | "admins";
    severity: "info" | "success" | "warning" | "critical";
    publish?: boolean; expiresAt?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = {
      title: data.title, body: data.body, audience: data.audience, severity: data.severity,
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
    await audit(context.userId, "announcement.upsert", "announcement", data.id ?? "new", { title: data.title });
    return { ok: true };
  });

export const adminDeleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "announcement.delete", "announcement", data.id);
    return { ok: true };
  });

export const adminListDemos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles")
      .select("id, username, display_name, avatar_url, created_at")
      .eq("is_demo", true).order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const adminGetMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    return (data ?? []).map((r: any) => r.role as string);
  });

export const adminAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("admin_audit_log").select("*")
      .order("created_at", { ascending: false }).limit(100);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) throw new Error("Un administrateur existe déjà");
    const { error } = await supabaseAdmin.from("user_roles")
      .insert({ user_id: context.userId, role: "admin", granted_by: context.userId });
    if (error) throw new Error(error.message);
    await audit(context.userId, "role.bootstrap", "user_roles", context.userId, { role: "admin" });
    return { ok: true };
  });


const VISIBILITIES = new Set(["public", "limited", "hidden"]);
const AI_ACCESS_LEVELS = new Set(["free", "pro", "disabled"]);

export const adminSetUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const data = raw as {
      userId?: string; visibility?: string; verified?: boolean; featured?: boolean;
      aiAccess?: string; aiDailyLimit?: number;
    };
    const userId = String(data.userId ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)) throw new Error("Utilisateur invalide");
    const visibility = String(data.visibility ?? "public");
    const aiAccess = String(data.aiAccess ?? "free");
    if (!VISIBILITIES.has(visibility)) throw new Error("Visibilité invalide");
    if (!AI_ACCESS_LEVELS.has(aiAccess)) throw new Error("Niveau IA invalide");
    const aiDailyLimit = Math.trunc(Number(data.aiDailyLimit ?? 50));
    if (!Number.isFinite(aiDailyLimit) || aiDailyLimit < 1 || aiDailyLimit > 1000) throw new Error("Quota IA invalide");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({
      visibility: data.visibility,
      verified: data.verified,
      featured: data.featured,
      ai_access: data.aiAccess,
      ai_daily_limit: data.aiDailyLimit,
      updated_at: new Date().toISOString(),
    }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    await audit(context.userId, "user.access.update", "profile", data.userId, {
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("badges")
      .select("id, label, description, emoji")
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminSetUserBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const data = raw as { userId?: string; badgeId?: string; action?: string };
    const userId = String(data.userId ?? "");
    const badgeId = String(data.badgeId ?? "").trim().slice(0, 80);
    const action = data.action === "revoke" ? "revoke" : "grant";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId) || !/^[a-z0-9_-]{2,80}$/i.test(badgeId)) {
      throw new Error("Badge ou utilisateur invalide");
    }
    return { userId, badgeId, action } as const;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "grant") {
      const { error } = await supabaseAdmin.from("user_badges").upsert({
        user_id: data.userId,
        badge_id: data.badgeId,
        earned_at: new Date().toISOString(),
      }, { onConflict: "user_id,badge_id" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_badges").delete()
        .eq("user_id", data.userId).eq("badge_id", data.badgeId);
      if (error) throw new Error(error.message);
    }
    await audit(context.userId, `badge.${data.action}`, "user_badges", data.userId, { badgeId: data.badgeId });
    return { ok: true };
  });
