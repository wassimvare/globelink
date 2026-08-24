import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun.cloudflare.com:3478",
];

function parseTurnUrls(raw: string | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^turns?:[^\s]+$/i.test(value))
    .slice(0, 8);
}

export const getRtcIceConfiguration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const iceServers: RTCIceServer[] = [{ urls: DEFAULT_STUN_URLS }];
    const turnUrls = parseTurnUrls(process.env.TURN_URL);
    if (turnUrls.length > 0) {
      const username = String(process.env.TURN_USERNAME ?? "").slice(0, 512);
      const credential = String(process.env.TURN_CREDENTIAL ?? "").slice(0, 2048);
      if (!username || !credential) {
        throw new Error("TURN_URL est configuré mais TURN_USERNAME/TURN_CREDENTIAL sont absents.");
      }
      iceServers.push({ urls: turnUrls, username, credential });
    }
    return { iceServers, iceCandidatePoolSize: 6 } satisfies RTCConfiguration;
  });
