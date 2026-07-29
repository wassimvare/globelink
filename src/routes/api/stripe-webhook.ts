import { createFileRoute } from "@tanstack/react-router";

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

async function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  return signatures.some((signature) => safeEqual(signature, digest));
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, any> };
};

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook non configuré", { status: 503 });
        const payload = await request.text();
        if (payload.length > 500_000) return new Response("Payload trop volumineux", { status: 413 });
        const signature = request.headers.get("stripe-signature") ?? "";
        if (!(await verifyStripeSignature(payload, signature, secret))) return new Response("Signature invalide", { status: 400 });

        let event: StripeEvent;
        try { event = JSON.parse(payload) as StripeEvent; } catch { return new Response("JSON invalide", { status: 400 }); }
        if (!event.id || !event.type || !event.data?.object) return new Response("Événement invalide", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const object = event.data.object;
        const userId = object.metadata?.user_id || object.client_reference_id;

        // Idempotency: Stripe retries webhooks until acknowledged.
        const { data: existing } = await db.from("stripe_webhook_events").select("event_id").eq("event_id", event.id).maybeSingle();
        if (existing) return new Response("ok", { status: 200 });

        if (event.type === "checkout.session.completed" && userId) {
          await db.from("ai_subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id,
            stripe_subscription_id: typeof object.subscription === "string" ? object.subscription : object.subscription?.id,
            status: "active",
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }

        if ((event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") && userId) {
          const periodEnd = object.current_period_end ? new Date(Number(object.current_period_end) * 1000).toISOString() : null;
          await db.from("ai_subscriptions").upsert({
            user_id: userId,
            stripe_customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id,
            stripe_subscription_id: object.id,
            status: event.type === "customer.subscription.deleted" ? "canceled" : String(object.status ?? "inactive"),
            current_period_end: periodEnd,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }

        await db.from("stripe_webhook_events").insert({ event_id: event.id, event_type: event.type });
        return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      },
    },
  },
});
