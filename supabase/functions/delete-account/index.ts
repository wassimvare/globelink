import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import postgres from "npm:postgres@3.4.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function readKey(name: "SUPABASE_PUBLISHABLE_KEYS" | "SUPABASE_SECRET_KEYS", legacy: string) {
  const raw = Deno.env.get(name);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    } catch {}
  }
  return Deno.env.get(legacy) ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  let sql: ReturnType<typeof postgres> | null = null;
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const phrase = String(body?.confirmationPhrase ?? "").trim();
    const confirmationEmail = String(body?.confirmationEmail ?? "").trim().toLowerCase();
    if (phrase !== "SUPPRIMER") return Response.json({ error: "Confirmation phrase invalid" }, { status: 400, headers: corsHeaders });

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = readKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = readKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(url, publishableKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const user = authData.user;
    if (!user.email || confirmationEmail !== user.email.toLowerCase()) {
      return Response.json({ error: "Email confirmation does not match" }, { status: 400, headers: corsHeaders });
    }

    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) throw new Error("Database connection unavailable");
    sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 2 });

    const objects = await sql<{ bucket_id: string; name: string }[]>`
      select bucket_id, name
      from storage.objects
      where owner_id = ${user.id} or owner = ${user.id}::uuid
    `;

    const grouped = new Map<string, string[]>();
    for (const object of objects) {
      const list = grouped.get(object.bucket_id) ?? [];
      list.push(object.name);
      grouped.set(object.bucket_id, list);
    }
    for (const [bucket, names] of grouped) {
      for (let i = 0; i < names.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
        if (error) throw new Error(`Storage cleanup failed in ${bucket}: ${error.message}`);
      }
    }

    await sql.begin(async (tx) => {
      await tx`update public.announcements set author_id = null where author_id = ${user.id}::uuid`;
      await tx`update public.reports set resolved_by = null where resolved_by = ${user.id}::uuid`;
      await tx`update public.user_roles set granted_by = null where granted_by = ${user.id}::uuid`;
      await tx`delete from public.ai_admin_grants where granted_by = ${user.id}::uuid`;
    });

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return Response.json({ ok: true }, { status: 200, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("delete-account", error);
    return Response.json({ error: error instanceof Error ? error.message : "Account deletion failed" }, { status: 500, headers: corsHeaders });
  } finally {
    if (sql) await sql.end({ timeout: 1 }).catch(() => {});
  }
});
