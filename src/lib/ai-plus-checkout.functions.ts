import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicAppOrigin } from "./auth-redirects";

type BillingPlan = "monthly" | "annual";

export const createAiPlusCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown): { plan: BillingPlan } => {
    const plan = (input as { plan?: unknown } | null)?.plan;
    if (plan !== "monthly" && plan !== "annual") throw new Error("Formule IA+ invalide.");
    return { plan };
  })
  .handler(async ({ data, context }) => {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error("Le paiement IA+ n'est pas encore configuré.");

    const monthlyPriceId =
      process.env.STRIPE_AI_PLUS_MONTHLY_PRICE_ID || process.env.STRIPE_AI_PRO_PRICE_ID;
    const annualPriceId = process.env.STRIPE_AI_PLUS_ANNUAL_PRICE_ID;
    const priceId = data.plan === "annual" ? annualPriceId : monthlyPriceId;

    if (!priceId) {
      throw new Error(
        data.plan === "annual"
          ? "La formule annuelle IA+ doit encore être configurée dans Stripe."
          : "La formule mensuelle IA+ doit encore être configurée dans Stripe.",
      );
    }

    const claims = context.claims as Record<string, unknown>;
    const email = typeof claims.email === "string" ? claims.email : undefined;
    const origin = publicAppOrigin();
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("client_reference_id", context.userId);
    params.set("metadata[user_id]", context.userId);
    params.set("metadata[ai_plus_plan]", data.plan);
    params.set("subscription_data[metadata][user_id]", context.userId);
    params.set("subscription_data[metadata][ai_plus_plan]", data.plan);
    params.set("subscription_data[trial_period_days]", "7");
    params.set("success_url", `${origin}/ai-pro?checkout=success`);
    params.set("cancel_url", `${origin}/ai-pro?checkout=cancelled`);
    params.set("allow_promotion_codes", "true");
    if (email) params.set("customer_email", email);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const payload = (await response.json()) as { url?: string; error?: { message?: string } };
    if (!response.ok || !payload.url)
      throw new Error(payload.error?.message || "Impossible d'ouvrir le paiement sécurisé.");
    return { url: payload.url };
  });
