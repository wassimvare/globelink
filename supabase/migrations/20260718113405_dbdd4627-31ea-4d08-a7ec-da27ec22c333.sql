
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

CREATE OR REPLACE FUNCTION public.ensure_demo_profile(_username text, _display_name text DEFAULT NULL, _avatar_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  new_id uuid;
  clean_username text;
  h text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  clean_username := regexp_replace(lower(_username), '[^a-z0-9_.]', '', 'g');
  IF clean_username = '' THEN RAISE EXCEPTION 'Invalid username'; END IF;

  SELECT id INTO existing_id FROM public.profiles WHERE username = clean_username LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  -- Deterministic UUID v4-shaped from md5(username), all hex chars
  h := md5('globelink-demo:' || clean_username);
  new_id := (substr(h,1,8) || '-' || substr(h,9,4) || '-4' || substr(h,14,3) || '-8' || substr(h,18,3) || '-' || substr(h,21,12))::uuid;

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (new_id, clean_username, COALESCE(_display_name, clean_username), _avatar_url)
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
  RETURNING id INTO existing_id;

  RETURN existing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_demo_profile(text, text, text) TO authenticated;
