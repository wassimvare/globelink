CREATE OR REPLACE FUNCTION public.open_or_create_direct_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  existing_conv uuid;
  created_conv uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _other_user_id IS NULL THEN
    RAISE EXCEPTION 'Target profile is required';
  END IF;

  IF _other_user_id = current_user_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id) THEN
    RAISE EXCEPTION 'Current profile not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _other_user_id) THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;

  SELECT cp1.conversation_id INTO existing_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
  WHERE cp1.user_id = current_user_id
    AND cp2.user_id = _other_user_id
  ORDER BY cp1.joined_at DESC
  LIMIT 1;

  IF existing_conv IS NOT NULL THEN
    RETURN existing_conv;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES
  RETURNING id INTO created_conv;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (created_conv, current_user_id), (created_conv, _other_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN created_conv;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.open_or_create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_or_create_direct_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_or_create_direct_conversation(uuid) TO service_role;

DROP POLICY IF EXISTS "auth users create conversations" ON public.conversations;
CREATE POLICY "Authenticated users create conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "participants read conversations" ON public.conversations;
CREATE POLICY "Participants read conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(id, auth.uid()));

DROP POLICY IF EXISTS "participants update conversation" ON public.conversations;
CREATE POLICY "Participants update conversation" ON public.conversations
  FOR UPDATE TO authenticated
  USING (public.is_conversation_participant(id, auth.uid()));

DROP POLICY IF EXISTS "user adds self or participants add others" ON public.conversation_participants;
CREATE POLICY "Participants can add members" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "user reads own participation" ON public.conversation_participants;
CREATE POLICY "Participants read memberships" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "participants send messages" ON public.messages;
CREATE POLICY "Participants send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "participants read messages" ON public.messages;
CREATE POLICY "Participants read messages" ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));