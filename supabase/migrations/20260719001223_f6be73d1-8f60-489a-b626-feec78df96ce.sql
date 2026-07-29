
CREATE OR REPLACE FUNCTION public.ensure_demo_profile(_username text, _display_name text DEFAULT NULL::text, _avatar_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  h := md5('globelink-demo:' || clean_username);
  new_id := (substr(h,1,8) || '-' || substr(h,9,4) || '-4' || substr(h,14,3) || '-8' || substr(h,18,3) || '-' || substr(h,21,12))::uuid;

  INSERT INTO public.profiles (id, username, display_name, avatar_url, is_demo)
  VALUES (new_id, clean_username, COALESCE(_display_name, clean_username), _avatar_url, true)
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, is_demo = true
  RETURNING id INTO existing_id;

  RETURN existing_id;
END;
$function$;
