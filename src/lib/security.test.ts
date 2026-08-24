import { describe, expect, it } from "vitest";
import { extractBearerToken, isUuid } from "./security";

describe("HTTP bearer authentication", () => {
  it("extracts a syntactically valid JWT", () => {
    expect(extractBearerToken("Bearer header.payload.signature")).toBe("header.payload.signature");
  });

  it.each([null, "", "Basic abc", "bearer a.b.c"])(
    "rejects a missing or non-Bearer header: %s",
    (header) => {
      expect(() => extractBearerToken(header)).toThrow("Bearer token required");
    },
  );

  it.each(["Bearer ", "Bearer one-part", "Bearer a.b", `Bearer a.${"x".repeat(8_193)}.c`])(
    "rejects a malformed or oversized JWT",
    (header) => {
      expect(() => extractBearerToken(header)).toThrow("Invalid token");
    },
  );
});

describe("UUID validation", () => {
  it("accepts application UUIDs", () => {
    expect(isUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it.each(["", "not-a-uuid", "../../../etc/passwd", null, 42])(
    "rejects invalid identifiers",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});
