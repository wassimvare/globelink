import { describe, expect, it } from "vitest";
import { safeEqual, verifyStripeSignature } from "./stripe-webhook";

async function sign(payload: string, timestamp: number, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("Stripe webhook signatures", () => {
  it("uses a length-aware constant-time comparison", () => {
    expect(safeEqual("same-value", "same-value")).toBe(true);
    expect(safeEqual("same-value", "other-value")).toBe(false);
    expect(safeEqual("short", "longer")).toBe(false);
  });

  it("accepts a current valid signature and rejects a modified payload", async () => {
    const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
    const timestamp = Math.floor(Date.now() / 1_000);
    const secret = "whsec_test_only";
    const signature = await sign(payload, timestamp, secret);
    const header = `t=${timestamp},v1=${signature}`;

    await expect(verifyStripeSignature(payload, header, secret)).resolves.toBe(true);
    await expect(verifyStripeSignature(`${payload}x`, header, secret)).resolves.toBe(false);
  });

  it("rejects replayed signatures outside the five-minute window", async () => {
    const payload = "{}";
    const timestamp = Math.floor(Date.now() / 1_000) - 301;
    const secret = "whsec_test_only";
    const signature = await sign(payload, timestamp, secret);
    await expect(
      verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret),
    ).resolves.toBe(false);
  });
});
