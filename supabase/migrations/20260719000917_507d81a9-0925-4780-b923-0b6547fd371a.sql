
-- 1. Roles enum + user_roles table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('user', 'moderator', 'admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. has_role security-definer function (no recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin') $$;

CREATE OR REPLACE FUNCTION public.is_moderator_or_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'moderator') $$;

-- user_roles policies
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 3. Profiles: status + is_demo
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- Admin/mod override policies on profiles / posts / comments
DROP POLICY IF EXISTS "admins manage profiles" ON public.profiles;
CREATE POLICY "admins manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "mods delete posts" ON public.posts;
CREATE POLICY "mods delete posts" ON public.posts FOR DELETE TO authenticated
  USING (public.is_moderator_or_admin(auth.uid()));
DROP POLICY IF EXISTS "mods update posts" ON public.posts;
CREATE POLICY "mods update posts" ON public.posts FOR UPDATE TO authenticated
  USING (public.is_moderator_or_admin(auth.uid())) WITH CHECK (true);

DROP POLICY IF EXISTS "mods delete comments" ON public.comments;
CREATE POLICY "mods delete comments" ON public.comments FOR DELETE TO authenticated
  USING (public.is_moderator_or_admin(auth.uid()));

-- 4. Reports
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post','comment','profile','message')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users create reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reporter reads own" ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_moderator_or_admin(auth.uid()));
CREATE POLICY "mods update reports" ON public.reports FOR UPDATE TO authenticated
  USING (public.is_moderator_or_admin(auth.uid())) WITH CHECK (public.is_moderator_or_admin(auth.uid()));
CREATE POLICY "admins delete reports" ON public.reports FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','premium','moderators','admins')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),
  published_at timestamptz,
  expires_at timestamptz,
  author_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read active announcements" ON public.announcements FOR SELECT TO authenticated
  USING (
    published_at IS NOT NULL
    AND published_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      audience = 'all'
      OR (audience = 'moderators' AND public.is_moderator_or_admin(auth.uid()))
      OR (audience = 'admins' AND public.is_admin(auth.uid()))
    )
  );
CREATE POLICY "admins read all announcements" ON public.announcements FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "admins write announcements" ON public.announcements FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Mark existing demo profiles (created by ensure_demo_profile — those without an auth.users row)
UPDATE public.profiles p SET is_demo = true
WHERE is_demo = false AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
