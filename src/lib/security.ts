const JWT_MAX_LENGTH = 8_192;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Extracts a bounded JWT from a strict HTTP Bearer header. */
export function extractBearerToken(value: string | null): string {
  if (!value?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Bearer token required");
  }
  const token = value.slice("Bearer ".length).trim();
  if (!token || token.length > JWT_MAX_LENGTH || token.split(".").length !== 3) {
    throw new Error("Unauthorized: Invalid token");
  }
  return token;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
