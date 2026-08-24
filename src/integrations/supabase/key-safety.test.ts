import { describe, expect, it } from "vitest";
import { assertSafeSupabasePublishableKey, isSafeSupabasePublishableKey } from "./key-safety";

function jwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

describe("Supabase public key safety", () => {
  it("accepts modern publishable keys", () => {
    expect(isSafeSupabasePublishableKey("sb_publishable_example")).toBe(true);
  });

  it("rejects modern secret keys", () => {
    expect(isSafeSupabasePublishableKey("sb_secret_example")).toBe(false);
    expect(() => assertSafeSupabasePublishableKey("sb_secret_example")).toThrow(
      "Configuration Supabase dangereuse",
    );
  });

  it("accepts legacy anon JWTs", () => {
    expect(isSafeSupabasePublishableKey(jwt({ role: "anon" }))).toBe(true);
  });

  it("rejects legacy service_role JWTs", () => {
    expect(isSafeSupabasePublishableKey(jwt({ role: "service_role" }))).toBe(false);
  });
});
