alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz null;

-- Do not interrupt members who already use GlobeLink. Only profiles created
-- after this migration start with a pending onboarding state (NULL).
update public.profiles
set onboarding_completed_at = now()
where onboarding_completed_at is null;

comment on column public.profiles.onboarding_completed_at is
  'Timestamp set when the member completes or skips the lightweight GlobeLink onboarding.';
