DROP TRIGGER IF EXISTS trg_bump_conversation ON public.messages;
DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;

CREATE OR REPLACE FUNCTION public.bump_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r uuid;
BEGIN
  FOR r IN
    SELECT user_id FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id
  LOOP
    INSERT INTO public.notifications (recipient_id, actor_id, type, message_id, metadata)
    VALUES (r, NEW.sender_id, 'message', NEW.id,
            jsonb_build_object('conversation_id', NEW.conversation_id, 'preview', left(coalesce(NEW.content, ''), 140)))
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.send_match_like(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO service_role;