import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

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

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = readKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = readKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(url, publishableKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    const user = authData.user;

    async function allRows(table: string, column: string, value: string) {
      const out: unknown[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin.from(table).select("*").eq(column, value).range(from, from + pageSize - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        const page = data ?? [];
        out.push(...page);
        if (page.length < pageSize) break;
      }
      return out;
    }

    async function byIds(table: string, column: string, ids: string[]) {
      if (!ids.length) return [];
      const out: unknown[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await admin.from(table).select("*").in(column, ids.slice(i, i + 200));
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...(data ?? []));
      }
      return out;
    }

    const uid = user.id;
    const ownedSpecs: Array<[string, string]> = [
      ["profiles", "id"], ["user_settings", "user_id"], ["posts", "user_id"], ["stories", "user_id"],
      ["post_likes", "user_id"], ["post_reactions", "user_id"], ["post_saves", "user_id"],
      ["comments", "user_id"], ["comment_likes", "user_id"], ["story_likes", "user_id"],
      ["search_history", "user_id"], ["travel_intents", "user_id"], ["trips", "user_id"],
      ["trip_entries", "user_id"], ["trip_expenses", "user_id"], ["places", "user_id"],
      ["product_favorites", "user_id"], ["product_reviews", "user_id"], ["achievements", "user_id"],
      ["user_badges", "user_id"], ["notifications", "recipient_id"], ["user_relationship_controls", "owner_id"],
      ["close_friends", "owner_id"], ["user_mutes", "owner_id"], ["story_hidden_accounts", "owner_id"],
      ["match_passes", "user_id"], ["match_group_members", "user_id"], ["match_groups", "owner_id"],
      ["ai_subscriptions", "user_id"], ["ai_usage", "user_id"], ["account_security_events", "user_id"],
      ["support_tickets", "user_id"], ["reports", "reporter_id"],
    ];

    const data: Record<string, unknown> = {};
    await Promise.all(ownedSpecs.map(async ([table, column]) => { data[table] = await allRows(table, column, uid); }));

    const [matchFrom, matchTo, requestsSent, requestsReceived, memberships] = await Promise.all([
      allRows("match_likes", "from_user_id", uid),
      allRows("match_likes", "to_user_id", uid),
      allRows("conversation_requests", "sender_id", uid),
      allRows("conversation_requests", "recipient_id", uid),
      allRows("conversation_participants", "user_id", uid),
    ]);
    data.match_likes = Array.from(new Map([...(matchFrom as any[]), ...(matchTo as any[])].map((row) => [row.id, row])).values());
    data.conversation_requests = Array.from(new Map([...(requestsSent as any[]), ...(requestsReceived as any[])].map((row) => [row.id ?? `${row.conversation_id}-${row.sender_id}-${row.recipient_id}`, row])).values());
    data.conversation_participants_self = memberships;

    const conversationIds = Array.from(new Set((memberships as any[]).map((row) => row.conversation_id).filter(Boolean)));
    data.conversations = await byIds("conversations", "id", conversationIds);
    data.conversation_participants = await byIds("conversation_participants", "conversation_id", conversationIds);
    data.messages = await byIds("messages", "conversation_id", conversationIds);

    const exportPayload = {
      export_version: 1,
      generated_at: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        phone_confirmed_at: user.phone_confirmed_at ?? null,
        providers: user.app_metadata?.providers ?? (user.app_metadata?.provider ? [user.app_metadata.provider] : []),
      },
      data,
    };

    await admin.from("account_security_events").insert({ user_id: uid, event_type: "data_exported", metadata: { format: "json", version: 1 } });

    return new Response(JSON.stringify(exportPayload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("export-account-data", error);
    return Response.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500, headers: corsHeaders });
  }
});