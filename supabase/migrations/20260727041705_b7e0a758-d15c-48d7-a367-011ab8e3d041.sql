CREATE TABLE public.story_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.story_likes TO authenticated;
GRANT ALL ON public.story_likes TO service_role;

ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can like stories" ON public.story_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike their own like" ON public.story_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Own like or story owner can read" ON public.story_likes
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );

CREATE INDEX idx_story_likes_story ON public.story_likes(story_id);

CREATE OR REPLACE FUNCTION public.notify_on_story_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.stories WHERE id = NEW.story_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, metadata)
    VALUES (owner, NEW.user_id, 'story_like', jsonb_build_object('story_id', NEW.story_id));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_on_story_like
AFTER INSERT ON public.story_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_story_like();