-- GlobeLink V8: real accounts only, email-verification state and defence in depth.

-- 1) Remove generated/demo/orphan profiles, then restore the canonical Auth FK.
DROP FUNCTION IF EXISTS public.ensure_demo_profile(text, text, text);
DROP TRIGGER IF EXISTS protect_admin_profile_fields_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_admin_profile_fields();

DELETE FROM public.profiles p
WHERE COALESCE(p.is_demo, false) = true
   OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

UPDATE public.profiles p
SET email_verified_at = u.email_confirmed_at
FROM auth.users u
WHERE u.id = p.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.email_verified_at IS DISTINCT FROM u.email_confirmed_at;

-- 2) Keep the public profile state synchronised with Supabase Auth.
CREATE OR REPLACE FUNCTION public.sync_profile_email_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email_verified_at = NEW.email_confirmed_at,
      updated_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_email_verified ON auth.users;
CREATE TRIGGER on_auth_email_verified
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at)
EXECUTE FUNCTION public.sync_profile_email_verification();

CREATE OR REPLACE FUNCTION public.current_user_email_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_email_verified() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_email_verified() TO authenticated, service_role;

-- 3) Atomic, case-insensitive usernames. Existing values are normalised once.
UPDATE public.profiles
SET username = CASE
  WHEN length(regexp_replace(lower(username), '[^a-z0-9_]', '', 'g')) >= 3
    THEN left(regexp_replace(lower(username), '[^a-z0-9_]', '', 'g'), 21) || '_' || substr(id::text, 1, 8)
  ELSE 'voyageur_' || substr(id::text, 1, 8)
END
WHERE username !~ '^[a-z0-9_]{3,30}$';

WITH ranked AS (
  SELECT id, username,
         row_number() OVER (PARTITION BY lower(username) ORDER BY created_at, id) AS rn
  FROM public.profiles
)
UPDATE public.profiles p
SET username = left(p.username, 22) || '_' || substr(p.id::text, 1, 6)
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
ON public.profiles (lower(username));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format_v8;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format_v8
  CHECK (username ~ '^[a-z0-9_]{3,30}$') NOT VALID;

-- 4) New users receive a private profile until the OTP is validated.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text;
  final_username text;
  suffix integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(lower(COALESCE(NEW.email, NEW.id::text))));
  base_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'voyageur');
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  base_username := left(base_username, 24);
  IF length(base_username) < 3 OR base_username IN ('admin','support','globelink','moderator','moderateur') THEN
    base_username := 'voyageur_' || substr(NEW.id::text, 1, 8);
  END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(final_username)) LOOP
    suffix := suffix + 1;
    final_username := left(base_username, greatest(3, 29 - length(suffix::text))) || suffix::text;
  END LOOP;

  INSERT INTO public.profiles (
    id, username, display_name, avatar_url, email_verified_at
  ) VALUES (
    NEW.id,
    final_username,
    left(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', final_username), 60),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email_confirmed_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email_verified_at = EXCLUDED.email_verified_at;
  RETURN NEW;
END;
$$;

-- Backfill genuine Auth users that do not yet have a profile.
INSERT INTO public.profiles (id, username, display_name, avatar_url, email_verified_at)
SELECT
  u.id,
  'voyageur_' || substr(u.id::text, 1, 12),
  left(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Voyageur'), 60),
  u.raw_user_meta_data->>'avatar_url',
  u.email_confirmed_at
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;


-- 5) Anonymous users only see email-verified profiles.
CREATE OR REPLACE FUNCTION public.current_user_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('moderator', 'admin')
  );
$$;
REVOKE ALL ON FUNCTION public.current_user_is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_staff() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Verified profiles are public" ON public.profiles;
CREATE POLICY "Verified profiles are public"
ON public.profiles FOR SELECT
USING (
  (email_verified_at IS NOT NULL AND status = 'active' AND visibility = 'public')
  OR id = auth.uid()
  OR public.current_user_is_staff()
);

CREATE OR REPLACE FUNCTION public.is_public_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _profile_id
      AND email_verified_at IS NOT NULL
      AND status = 'active'
      AND visibility = 'public'
  );
$$;
REVOKE ALL ON FUNCTION public.is_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_profile(uuid) TO anon, authenticated, service_role;

-- Hide content belonging to unverified, suspended or hidden profiles.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('posts','user_id'),
    ('comments','user_id'),
    ('stories','user_id'),
    ('places','user_id'),
    ('products','seller_id'),
    ('community_questions','author_id'),
    ('community_answers','author_id'),
    ('travel_intents','user_id')
  ) AS entries(table_name, owner_column) LOOP
    IF to_regclass('public.' || item.table_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v8_public_owner_' || item.table_name, item.table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (public.is_public_profile(%I) OR %I = auth.uid() OR public.current_user_is_staff())',
        'v8_public_owner_' || item.table_name, item.table_name, item.owner_column, item.owner_column
      );
    END IF;
  END LOOP;
END $$;

-- Prevent normal users from changing moderation, verification or quota fields.
CREATE OR REPLACE FUNCTION public.protect_profile_system_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id AND NOT public.current_user_is_staff() THEN
    NEW.id := OLD.id;
    NEW.email_verified_at := OLD.email_verified_at;
    NEW.visibility := OLD.visibility;
    NEW.status := OLD.status;
    NEW.status_reason := OLD.status_reason;
    NEW.status_updated_at := OLD.status_updated_at;
    NEW.verified := OLD.verified;
    NEW.featured := OLD.featured;
    NEW.ai_access := OLD.ai_access;
    NEW.ai_daily_limit := OLD.ai_daily_limit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_system_fields_v8 ON public.profiles;
CREATE TRIGGER protect_profile_system_fields_v8
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_system_fields();

-- The demo marker no longer exists in the production schema.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_demo;

DROP POLICY IF EXISTS "v8 verified profile updates" ON public.profiles;
CREATE POLICY "v8 verified profile updates"
ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.current_user_email_verified())
WITH CHECK (public.current_user_email_verified());

-- 6) Restrictive policies: even if a permissive policy is added later,
-- writes still require a confirmed email address.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'posts','comments','post_likes','comment_likes','post_reactions','post_saves',
    'follows','stories','story_likes','places','products','product_reviews',
    'product_favorites','travel_intents','trips','community_questions',
    'community_answers','match_likes','match_passes','conversations',
    'conversation_participants','messages','reports'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v8_verified_insert_' || tbl, tbl);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.current_user_email_verified())', 'v8_verified_insert_' || tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v8_verified_update_' || tbl, tbl);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.current_user_email_verified()) WITH CHECK (public.current_user_email_verified())', 'v8_verified_update_' || tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'v8_verified_delete_' || tbl, tbl);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.current_user_email_verified())', 'v8_verified_delete_' || tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- Storage writes are restricted too. Reading public media remains unchanged.
DROP POLICY IF EXISTS "v8 verified media upload" ON storage.objects;
CREATE POLICY "v8 verified media upload" ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media' AND public.current_user_email_verified());

DROP POLICY IF EXISTS "v8 verified media update" ON storage.objects;
CREATE POLICY "v8 verified media update" ON storage.objects AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (bucket_id = 'media' AND public.current_user_email_verified())
WITH CHECK (bucket_id = 'media' AND public.current_user_email_verified());

DROP POLICY IF EXISTS "v8 verified media delete" ON storage.objects;
CREATE POLICY "v8 verified media delete" ON storage.objects AS RESTRICTIVE
FOR DELETE TO authenticated
USING (bucket_id = 'media' AND public.current_user_email_verified());

-- 7) Travel Match never fabricates a reverse like.
CREATE OR REPLACE FUNCTION public.send_match_like(_from_user_id uuid, _to_user_id uuid)
RETURNS TABLE(matched boolean, conversation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_conv uuid;
  reverse_exists boolean := false;
  created_conv uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _from_user_id OR NOT public.current_user_email_verified() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _from_user_id IS NULL OR _to_user_id IS NULL OR _from_user_id = _to_user_id THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _to_user_id AND email_verified_at IS NOT NULL AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;

  INSERT INTO public.match_likes (from_user_id, to_user_id)
  VALUES (_from_user_id, _to_user_id)
  ON CONFLICT (from_user_id, to_user_id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1 FROM public.match_likes
    WHERE from_user_id = _to_user_id AND to_user_id = _from_user_id
  ) INTO reverse_exists;

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

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO created_conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (created_conv, _from_user_id), (created_conv, _to_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN QUERY SELECT true, created_conv;
END;
$$;

REVOKE ALL ON FUNCTION public.send_match_like(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_match_like(uuid, uuid) TO authenticated, service_role;
