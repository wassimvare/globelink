-- GlobeLink V6: admin-managed visibility, badges and AI access.
-- These fields are protected by a trigger so a normal user cannot grant themself
-- verification, featuring or elevated AI access through the public API.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_access text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS ai_daily_limit integer NOT NULL DEFAULT 50;

UPDATE public.profiles
SET ai_access = 'disabled', ai_daily_limit = 3, visibility = 'limited'
WHERE is_demo = true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_visibility_valid') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_visibility_valid
      CHECK (visibility IN ('public', 'limited', 'hidden'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_ai_access_valid') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_ai_access_valid
      CHECK (ai_access IN ('free', 'pro', 'disabled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_ai_daily_limit_valid') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_ai_daily_limit_valid
      CHECK (ai_daily_limit BETWEEN 1 AND 1000);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.protect_admin_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role') OR auth.role() = 'service_role'
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
    OR NEW.featured IS DISTINCT FROM OLD.featured
    OR NEW.visibility IS DISTINCT FROM OLD.visibility
    OR NEW.ai_access IS DISTINCT FROM OLD.ai_access
    OR NEW.ai_daily_limit IS DISTINCT FROM OLD.ai_daily_limit
    OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.status_reason IS DISTINCT FROM OLD.status_reason
  THEN
    RAISE EXCEPTION 'admin-managed profile fields cannot be changed by this account'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_admin_profile_fields_trigger ON public.profiles;
CREATE TRIGGER protect_admin_profile_fields_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_profile_fields();

-- Badge assignment is now server/admin controlled. Users can still read badges.
REVOKE INSERT, UPDATE, DELETE ON public.user_badges FROM authenticated;

INSERT INTO public.badges (id, label, description, emoji) VALUES
  ('verified', 'Profil vérifié', 'Identité ou authenticité vérifiée par GlobeLink', '✓'),
  ('featured', 'À la une', 'Profil mis en avant par l’équipe GlobeLink', '✨'),
  ('travel_expert', 'Expert voyage', 'Contributeur reconnu pour la qualité de ses conseils', '🧭'),
  ('community_helper', 'Pilier de la communauté', 'Aide régulièrement les autres voyageurs', '🤝'),
  ('founding_member', 'Membre fondateur', 'Présent lors des débuts de GlobeLink', '🌐')
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  emoji = EXCLUDED.emoji;

CREATE INDEX IF NOT EXISTS profiles_visibility_idx ON public.profiles(visibility, status);
CREATE INDEX IF NOT EXISTS profiles_featured_idx ON public.profiles(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS profiles_ai_access_idx ON public.profiles(ai_access);
