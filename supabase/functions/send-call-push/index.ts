import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const EXPECTED_VAPID_PUBLIC_KEY =
  "BIp0OrlWcwJjq9XEAhxuGN8k_Vicpg3efz5CtyANPf82qlu1tqYYUOXqbuVXymE-ou4E_s3ZUCgH8DkkUErposQ";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RuntimeConfig = {
  privateKey?: string;
  subject?: string;
  vapidKeysJson?: string;
};

type CallPushBody = {
  recipientId?: unknown;
  callId?: unknown;
  conversationId?: unknown;
  kind?: unknown;
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

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function readRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const path = new URL("../_shared/call-push-runtime.json", import.meta.url);
    return JSON.parse(await Deno.readTextFile(path));
  } catch {
    return {};
  }
}

async function loadVapidKeys(config: RuntimeConfig) {
  const serialized =
    Deno.env.get("GLOBELINK_VAPID_KEYS_JSON") ||
    Deno.env.get("VAPID_KEYS_JSON") ||
    config.vapidKeysJson ||
    "";

  if (serialized) {
    const imported = await webpush.importVapidKeys(JSON.parse(serialized), { extractable: false });
    const publicKey = await webpush.exportApplicationServerKey(imported);
    if (publicKey !== EXPECTED_VAPID_PUBLIC_KEY) {
      throw new Error("La clé VAPID publique ne correspond pas à celle utilisée par GlobeLink.");
    }
    return imported;
  }

  const privateKey =
    Deno.env.get("GLOBELINK_VAPID_PRIVATE_KEY") ||
    Deno.env.get("VAPID_PRIVATE_KEY") ||
    Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ||
    config.privateKey ||
    "";

  const publicBytes = decodeBase64Url(EXPECTED_VAPID_PUBLIC_KEY);
  const privateBytes = decodeBase64Url(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Clés VAPID absentes ou invalides.");
  }

  const x = encodeBase64Url(publicBytes.slice(1, 33));
  const y = encodeBase64Url(publicBytes.slice(33, 65));
  const d = encodeBase64Url(privateBytes);
  return await webpush.importVapidKeys(
    {
      publicKey: {
        kty: "EC",
        crv: "P-256",
        alg: "ES256",
        x,
        y,
        key_ops: ["verify"],
        ext: true,
      },
      privateKey: {
        kty: "EC",
        crv: "P-256",
        alg: "ES256",
        x,
        y,
        d,
        key_ops: ["sign"],
        ext: true,
      },
    },
    { extractable: false },
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isCallId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value.replace(/-/g, ""));
}

function callTopic(callId: string) {
  return callId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return Response.json({ error: "Authentication required" }, { status: 401, headers: corsHeaders });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = readKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = readKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !publishableKey || !secretKey) throw new Error("Configuration Supabase incomplète.");

    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    }

    const body = (await req.json().catch(() => ({}))) as CallPushBody;
    const recipientId = body.recipientId;
    const conversationId = body.conversationId;
    const callId = body.callId;
    const kind = body.kind;

    if (!isUuid(recipientId) || !isUuid(conversationId) || !isCallId(callId) || (kind !== "audio" && kind !== "video")) {
      return Response.json({ error: "Invalid call payload" }, { status: 400, headers: corsHeaders });
    }
    if (recipientId === authData.user.id) {
      return Response.json({ error: "Invalid recipient" }, { status: 400, headers: corsHeaders });
    }

    const { data: participants, error: participantsError } = await admin
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .in("user_id", [authData.user.id, recipientId]);
    if (participantsError) throw participantsError;
    if (new Set((participants ?? []).map((row) => row.user_id)).size !== 2) {
      return Response.json({ error: "Conversation access denied" }, { status: 403, headers: corsHeaders });
    }

    const recentSince = new Date(Date.now() - 120_000).toISOString();
    const { data: invite, error: inviteError } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("sender_id", authData.user.id)
      .eq("attachment_type", "rtc")
      .contains("attachment_meta", {
        call_id: callId,
        signal: "invite",
        recipient_id: recipientId,
        kind,
      })
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inviteError) throw inviteError;
    if (!invite) {
      return Response.json({ error: "Recent call invitation not found" }, { status: 409, headers: corsHeaders });
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", recipientId);
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) {
      return Response.json(
        { ok: true, sent: 0, removed: 0, failed: 0, reason: "no_subscription" },
        { status: 200, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
      );
    }

    const config = await readRuntimeConfig();
    const vapidKeys = await loadVapidKeys(config);
    const subject =
      Deno.env.get("VAPID_SUBJECT") ||
      Deno.env.get("GLOBELINK_VAPID_SUBJECT") ||
      config.subject ||
      Deno.env.get("PUBLIC_APP_URL") ||
      "https://globelink.app";
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: subject,
      vapidKeys,
    });

    const callerName =
      String(authData.user.user_metadata?.display_name ?? authData.user.user_metadata?.full_name ?? "").trim() ||
      authData.user.email?.split("@")[0] ||
      "Un voyageur";
    const callerAvatar =
      typeof authData.user.user_metadata?.avatar_url === "string"
        ? authData.user.user_metadata.avatar_url
        : null;

    const payload = JSON.stringify({
      title: callerName,
      body: kind === "video" ? "Appel vidéo entrant" : "Appel audio entrant",
      icon: callerAvatar || "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
      badge: "/icons/globelink-app-icon-192-v20260824.png?v=20260825-rgb2",
      tag: `globelink-call-${callId}`,
      requireInteraction: true,
      data: {
        url: `/messages/${conversationId}`,
        callId,
        conversationId,
        kind,
      },
    });

    let sent = 0;
    let removed = 0;
    let failed = 0;
    for (const subscription of subscriptions) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        });
        await subscriber.pushTextMessage(payload, {
          urgency: webpush.Urgency.High,
          ttl: 60,
          topic: callTopic(callId),
        });
        sent += 1;
      } catch (error) {
        if (
          error instanceof webpush.PushMessageError &&
          (error.response.status === 404 || error.response.status === 410)
        ) {
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          removed += 1;
        } else {
          failed += 1;
          console.error("send-call-push delivery", error);
        }
      }
    }

    return Response.json(
      { ok: true, sent, removed, failed },
      { status: 200, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("send-call-push", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Push delivery failed" },
      { status: 500, headers: { ...corsHeaders, "Cache-Control": "no-store" } },
    );
  }
});
