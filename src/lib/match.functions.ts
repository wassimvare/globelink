import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SendLikeInput = { toUserId: string };

export const sendMatchLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SendLikeInput) => {
    if (!data?.toUserId || typeof data.toUserId !== "string") throw new Error("toUserId requis");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const toUserId = data.toUserId;
    if (toUserId === userId) return { matched: false, conversationId: null as string | null };

    const rpcClient = supabase as unknown as {
      rpc: (name: string, args: Record<string, string>) => Promise<{
        data: { matched: boolean; conversation_id: string | null }[] | { matched: boolean; conversation_id: string | null } | null;
        error: { message: string } | null;
      }>;
    };
    const { data: result, error } = await rpcClient.rpc("send_match_like", {
      _from_user_id: userId,
      _to_user_id: toUserId,
    });
    if (error) throw new Error(error.message);

    const row = Array.isArray(result) ? result[0] : result;
    return { matched: !!row?.matched, conversationId: row?.conversation_id ?? null };
  });
