-- Allow authenticated users to persist completion of the simple onboarding.
-- Profile updates are column-scoped in production; this column was added after
-- the existing grants, so onboarding PATCH requests were rejected with 403.
grant update (onboarding_completed_at)
  on table public.profiles
  to authenticated;
