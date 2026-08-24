
-- 1. Comment replies
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS comments_post_id_idx ON public.comments(post_id);

-- 2. Typed reactions on posts
CREATE TYPE public.reaction_type AS ENUM ('love','wow','haha','fire','wanderlust','sad');

CREATE TABLE public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction public.reaction_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reactions TO authenticated;
GRANT SELECT ON public.post_reactions TO anon;
GRANT ALL ON public.post_reactions TO service_role;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions readable by all" ON public.post_reactions FOR SELECT USING (true);
CREATE POLICY "users manage own reactions" ON public.post_reactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX post_reactions_post_idx ON public.post_reactions(post_id);

-- 3. Notifications
CREATE TYPE public.notification_type AS ENUM ('like','comment','reply','follow','mention','message','reaction');

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  message_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipient reads own notifications" ON public.notifications FOR SELECT
  USING (auth.uid() = recipient_id);
CREATE POLICY "recipient updates own notifications" ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id);
CREATE POLICY "recipient deletes own notifications" ON public.notifications FOR DELETE
  USING (auth.uid() = recipient_id);
CREATE INDEX notifications_recipient_idx ON public.notifications(recipient_id, created_at DESC);

-- 4. Direct messages: conversations + participants + messages
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at DESC);

-- Helper: is participant (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conv uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conv AND user_id = _user
  )
$$;

CREATE POLICY "participants read conversations" ON public.conversations FOR SELECT
  USING (public.is_conversation_participant(id, auth.uid()));
CREATE POLICY "auth users create conversations" ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "participants update conversation" ON public.conversations FOR UPDATE
  USING (public.is_conversation_participant(id, auth.uid()));

CREATE POLICY "user reads own participation" ON public.conversation_participants FOR SELECT
  USING (auth.uid() = user_id OR public.is_conversation_participant(conversation_id, auth.uid()));
CREATE POLICY "user adds self or participants add others" ON public.conversation_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_conversation_participant(conversation_id, auth.uid()));
CREATE POLICY "user updates own participation" ON public.conversation_participants FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "user removes own participation" ON public.conversation_participants FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "participants read messages" ON public.messages FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));
CREATE POLICY "participants send messages" ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND public.is_conversation_participant(conversation_id, auth.uid()));
CREATE POLICY "sender deletes message" ON public.messages FOR DELETE
  USING (auth.uid() = sender_id);

-- Update conversation.last_message_at on new message
CREATE OR REPLACE FUNCTION public.bump_conversation_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_bump_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_timestamp();

-- 5. Auto-notifications on likes, comments, follows, reactions, messages
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
    VALUES (owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_like AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, metadata)
    VALUES (owner, NEW.user_id, 'reaction', NEW.post_id, jsonb_build_object('reaction', NEW.reaction));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_reaction AFTER INSERT ON public.post_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reaction();

CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE post_owner uuid; parent_author uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_author FROM public.comments WHERE id = NEW.parent_id;
    IF parent_author IS NOT NULL AND parent_author <> NEW.user_id THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, comment_id)
      VALUES (parent_author, NEW.user_id, 'reply', NEW.post_id, NEW.id);
    END IF;
  END IF;
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id AND (parent_author IS NULL OR post_owner <> parent_author) THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    VALUES (post_owner, NEW.user_id, 'comment', NEW.post_id, NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_follow AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r uuid;
BEGIN
  FOR r IN
    SELECT user_id FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id
  LOOP
    INSERT INTO public.notifications (recipient_id, actor_id, type, message_id, metadata)
    VALUES (r, NEW.sender_id, 'message', NEW.id,
            jsonb_build_object('conversation_id', NEW.conversation_id, 'preview', left(NEW.content, 140)));
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
