CREATE TABLE IF NOT EXISTS public.match_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (from_user_id, to_user_id)
);

GRANT SELECT, INSERT, DELETE ON public.match_likes TO authenticated;
GRANT ALL ON public.match_likes TO service_role;

ALTER TABLE public.match_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view likes involving them" ON public.match_likes
  FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users create their own likes" ON public.match_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users delete their own likes" ON public.match_likes
  FOR DELETE TO authenticated
  USING (auth.uid() = from_user_id);
