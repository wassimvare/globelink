CREATE TABLE public.comment_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

GRANT SELECT ON public.comment_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.comment_likes TO authenticated;
GRANT ALL ON public.comment_likes TO service_role;

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comment likes viewable by everyone" ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY "Users like comments" ON public.comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unlike own" ON public.comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX comment_likes_comment_idx ON public.comment_likes(comment_id);

CREATE OR REPLACE FUNCTION public.notify_on_comment_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE owner uuid; pid uuid;
BEGIN
  SELECT user_id, post_id INTO owner, pid FROM public.comments WHERE id = NEW.comment_id;
  IF owner IS NOT NULL AND owner <> NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    VALUES (owner, NEW.user_id, 'like', pid, NEW.comment_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_comment_like AFTER INSERT ON public.comment_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment_like();