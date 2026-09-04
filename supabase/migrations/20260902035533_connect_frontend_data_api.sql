-- Add the first browser-facing domain fields. Access remains private here;
-- authenticated policies and audited RPC grants are introduced by the later
-- workflow hardening migration.

alter table public.learning_sessions
  add column if not exists tasks_done integer not null default 0 check (tasks_done >= 0),
  add column if not exists tasks_total integer not null default 0 check (tasks_total >= 0),
  add column if not exists reflection text check (reflection in ('easy', 'ok', 'hard')),
  add column if not exists quick_check_score integer check (quick_check_score >= 0),
  add column if not exists quick_check_total integer check (quick_check_total >= 0),
  add column if not exists approval_policy text not null default 'parent_required'
    check (approval_policy in ('parent_required', 'auto_approve', 'evidence_required')),
  add column if not exists evidence_url text;

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  event_type text not null check (event_type in ('school', 'sport', 'learning', 'routine', 'rest')),
  subject text,
  day_of_week text not null check (day_of_week in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  status text not null default 'upcoming' check (status in ('completed', 'live', 'upcoming')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exceptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  severity text not null default 'low' check (severity in ('low', 'mid', 'high')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  recommended_action text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists schedule_events_family_day_idx
  on public.schedule_events (family_id, day_of_week, sort_order);
create index if not exists exceptions_family_status_idx
  on public.exceptions (family_id, status, created_at desc);

alter table public.schedule_events enable row level security;
alter table public.exceptions enable row level security;

-- Keep both browser roles closed while the schema is in this transitional
-- state. In particular, no demo IDs, data or anonymous mutations are shipped.
revoke all on table
  public.families, public.profiles, public.family_members, public.family_settings,
  public.learning_goals, public.learning_sessions, public.session_events,
  public.study_lock_events, public.approvals, public.ai_plans,
  public.notifications, public.family_invites, public.schedule_events, public.exceptions
from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'learning_sessions'
  ) then
    alter publication supabase_realtime add table public.learning_sessions;
  end if;
end
$$;
