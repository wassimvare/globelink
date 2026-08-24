
CREATE OR REPLACE FUNCTION public.ensure_demo_profile(
  _username TEXT,
  _display_name TEXT DEFAULT NULL,
  _avatar_url TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id UUID;
  new_id UUID;
  clean_username TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  clean_username := regexp_replace(lower(_username), '[^a-z0-9_.]', '', 'g');
  IF clean_username = '' THEN RAISE EXCEPTION 'Invalid username'; END IF;

  SELECT id INTO existing_id FROM public.profiles WHERE username = clean_username LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  -- Deterministic UUID derived from the username so repeated calls hit the same row.
  new_id := ('demo0000-0000-4000-8000-' || substr(md5(clean_username), 1, 12))::uuid;

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (new_id, clean_username, COALESCE(_display_name, clean_username), _avatar_url)
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
  RETURNING id INTO existing_id;

  RETURN existing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_demo_profile(TEXT, TEXT, TEXT) TO authenticated;
