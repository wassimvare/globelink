import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/lib/security";

type SendLikeInput = { toUserId: string };

export const sendMatchLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: SendLikeInput) => {
    if (!isUuid(data?.toUserId)) throw new Error("Voyageur invalide");
    return { toUserId: data.toUserId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const toUserId = data.toUserId;
    if (toUserId === userId) return { matched: false, conversationId: null as string | null };

    const rpcClient = supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, string>,
      ) => Promise<{
        data:
          | { matched: boolean; conversation_id: string | null }[]
          | { matched: boolean; conversation_id: string | null }
          | null;
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
