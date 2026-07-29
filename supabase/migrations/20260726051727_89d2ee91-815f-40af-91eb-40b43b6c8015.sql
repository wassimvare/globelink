REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.send_match_like(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_match_like(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_match_like(uuid, uuid) TO service_role;