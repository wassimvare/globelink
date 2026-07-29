-- GlobeLink AI Pro: subscription state, metering and webhook idempotency.
-- This migration intentionally keeps billing writes server-only.

create table if not exists public.ai_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive' check (status in ('inactive','trialing','active','past_due','unpaid','paused','canceled','incomplete','incomplete_expired')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (char_length(feature) between 1 and 40),
  mode text check (mode is null or char_length(mode) <= 40),
  query_chars integer not null default 0 check (query_chars between 0 and 100000),
  source_count integer not null default 0 check (source_count between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx on public.ai_usage(user_id, created_at desc);
create index if not exists ai_usage_feature_created_idx on public.ai_usage(feature, created_at desc);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.ai_subscriptions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.stripe_webhook_events enable row level security;

revoke all on public.ai_subscriptions from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;

grant select on public.ai_subscriptions to authenticated;
grant select, insert on public.ai_usage to authenticated;
grant usage, select on sequence public.ai_usage_id_seq to authenticated;

create policy "Users can read their AI subscription"
on public.ai_subscriptions for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can read their own AI usage"
on public.ai_usage for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can meter only their own AI usage"
on public.ai_usage for insert
to authenticated
with check (
  auth.uid() = user_id
  and feature = 'ai_pro'
  and query_chars between 0 and 3000
  and source_count between 0 and 10
);

-- No authenticated policies are defined for subscription writes or webhook
-- event access. These operations require the server-side service role.
