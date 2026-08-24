-- Keep demo/materialised profiles compatible with social graph rows.
ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_follower_id_fkey;
ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_following_id_fkey;
ALTER TABLE public.follows
  ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS stories_user_id_fkey;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Fast paths used by Travel Match, inbox and stories.
CREATE INDEX IF NOT EXISTS match_likes_to_from_idx ON public.match_likes (to_user_id, from_user_id);
CREATE INDEX IF NOT EXISTS match_passes_target_user_idx ON public.match_passes (target_id, user_id);
CREATE INDEX IF NOT EXISTS conversation_participants_user_conversation_idx ON public.conversation_participants (user_id, conversation_id);
CREATE INDEX IF NOT EXISTS conversation_participants_conversation_user_idx ON public.conversation_participants (conversation_id, user_id);
CREATE INDEX IF NOT EXISTS conversations_last_message_at_idx ON public.conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS stories_expires_created_idx ON public.stories (expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_user_expires_idx ON public.stories (user_id, expires_at DESC, created_at DESC);

-- Restore message side effects that were missing in the live database.
DROP TRIGGER IF EXISTS bump_conversation_timestamp_on_message ON public.messages;
CREATE TRIGGER bump_conversation_timestamp_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_timestamp();

DROP TRIGGER IF EXISTS notify_on_message_insert ON public.messages;
CREATE TRIGGER notify_on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- Atomic operation: like -> mutual detection -> conversation creation/reuse.
CREATE OR REPLACE FUNCTION public.send_match_like(_from_user_id uuid, _to_user_id uuid)
RETURNS TABLE(matched boolean, conversation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_is_demo boolean := false;
  existing_conv uuid;
  reverse_exists boolean := false;
  created_conv uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _from_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _from_user_id IS NULL OR _to_user_id IS NULL OR _from_user_id = _to_user_id THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _from_user_id) THEN
    RAISE EXCEPTION 'Current profile not found';
  END IF;

  SELECT COALESCE(is_demo, false) INTO target_is_demo
  FROM public.profiles
  WHERE id = _to_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;

  INSERT INTO public.match_likes (from_user_id, to_user_id)
  VALUES (_from_user_id, _to_user_id)
  ON CONFLICT (from_user_id, to_user_id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.match_likes
    WHERE from_user_id = _to_user_id AND to_user_id = _from_user_id
  ) INTO reverse_exists;

  IF NOT reverse_exists AND target_is_demo THEN
    INSERT INTO public.match_likes (from_user_id, to_user_id)
    VALUES (_to_user_id, _from_user_id)
    ON CONFLICT (from_user_id, to_user_id) DO NOTHING;
    reverse_exists := true;
  END IF;

  IF NOT reverse_exists THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  SELECT cp1.conversation_id INTO existing_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
  WHERE cp1.user_id = _from_user_id AND cp2.user_id = _to_user_id
  ORDER BY cp1.joined_at DESC
  LIMIT 1;

  IF existing_conv IS NOT NULL THEN
    RETURN QUERY SELECT true, existing_conv;
    RETURN;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES
  RETURNING id INTO created_conv;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (created_conv, _from_user_id), (created_conv, _to_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN QUERY SELECT true, created_conv;
END;
$$;

REVOKE ALL ON FUNCTION public.send_match_like(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_match_like(uuid, uuid) TO authenticated, service_role;

-- Clean broken 1-participant conversations left by previous failed attempts.
DELETE FROM public.conversations c
WHERE (
  SELECT count(*) FROM public.conversation_participants cp WHERE cp.conversation_id = c.id
) < 2;