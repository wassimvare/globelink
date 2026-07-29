-- GlobeLink defensive constraints and least-privilege hardening.
-- Constraints are NOT VALID so existing legacy/demo rows are not blocked;
-- PostgreSQL still enforces them for every new or updated row.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_safe') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_safe
      CHECK (username ~ '^[A-Za-z0-9._-]{3,24}$' AND lower(username) NOT IN ('admin','support','globelink','moderator','moderateur')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_text_lengths') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_text_lengths
      CHECK (
        char_length(coalesce(display_name, '')) <= 80
        AND char_length(coalesce(bio, '')) <= 1000
        AND char_length(coalesce(country, '')) <= 100
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_safe_lengths') THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_safe_lengths
      CHECK (
        char_length(coalesce(caption, '')) <= 3000
        AND char_length(coalesce(country, '')) <= 100
        AND char_length(image_url) <= 1200
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_valid_coordinates') THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_valid_coordinates
      CHECK ((lat IS NULL AND lng IS NULL) OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_safe_values') THEN
    ALTER TABLE public.places ADD CONSTRAINT places_safe_values
      CHECK (
        char_length(name) BETWEEN 2 AND 160
        AND char_length(category) <= 60
        AND char_length(country) BETWEEN 2 AND 100
        AND char_length(coalesce(city, '')) <= 120
        AND char_length(coalesce(description, '')) <= 5000
        AND lat BETWEEN -90 AND 90
        AND lng BETWEEN -180 AND 180
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_content_safe') THEN
    ALTER TABLE public.comments ADD CONSTRAINT comments_content_safe
      CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_content_safe') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_content_safe
      CHECK (char_length(btrim(content)) BETWEEN 1 AND 5000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_safe_values') THEN
    ALTER TABLE public.stories ADD CONSTRAINT stories_safe_values
      CHECK (
        char_length(media_url) <= 1200
        AND char_length(coalesce(caption, '')) <= 500
        AND expires_at > created_at
        AND expires_at <= created_at + interval '48 hours'
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_safe_lengths') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_safe_lengths
      CHECK (char_length(reason) BETWEEN 2 AND 120 AND char_length(coalesce(details, '')) <= 3000) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS posts_user_created_idx ON public.posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stories_user_created_idx ON public.stories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx ON public.notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS reports_status_created_idx ON public.reports(status, created_at DESC);

-- Security-definer helpers must not be directly executable by anonymous callers.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_moderator_or_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_moderator_or_admin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated, service_role;

-- Users never need direct DELETE rights on profiles; auth account deletion cascades safely.
REVOKE DELETE ON public.profiles FROM authenticated;
