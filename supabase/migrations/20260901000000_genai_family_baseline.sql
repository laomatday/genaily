-- Standalone baseline for a dedicated genAi Family Supabase project.
-- This migration intentionally contains schema only: development fixtures belong
-- in explicit seed tooling and production data must never be embedded in history.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'parent'
    check (role in ('parent', 'child', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('parent', 'child', 'guardian')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'invited')),
  joined_at timestamptz not null default now(),
  unique (family_id, profile_id)
);

create table if not exists public.family_settings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null unique references public.families(id) on delete cascade,
  screen_time_limit_minutes integer not null default 120
    check (screen_time_limit_minutes >= 0),
  study_lock_enabled boolean not null default true,
  default_approval_mode text not null default 'parent_required'
    check (default_approval_mode in ('parent_required', 'auto_approve', 'evidence_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (length(trim(title)) > 0),
  subject text not null check (length(trim(subject)) > 0),
  description text,
  target_minutes integer not null default 0 check (target_minutes >= 0),
  due_date date,
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid references public.learning_goals(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  subject text not null check (length(trim(subject)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  status text not null default 'scheduled'
    check (status in (
      'scheduled', 'in_progress', 'submitted', 'awaiting_parent',
      'approved', 'rejected', 'completed', 'cancelled'
    )),
  focus_score integer check (focus_score is null or focus_score between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.learning_sessions(id) on delete cascade,
  event_type text not null,
  event_time timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint session_events_event_type_check
    check (event_type in ('start', 'pause', 'resume', 'finish', 'checkpoint', 'warning', 'unlock'))
);

create table if not exists public.study_lock_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.learning_sessions(id) on delete set null,
  action text not null check (action in ('locked', 'unlocked')),
  reason text,
  triggered_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  session_id uuid not null references public.learning_sessions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.ai_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.learning_sessions(id) on delete set null,
  plan_type text not null,
  model_name text not null,
  input_summary text,
  output_json jsonb not null default '{}'::jsonb,
  status text not null default 'generated'
    check (status in ('generated', 'accepted', 'executed', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text not null,
  role text not null check (role in ('parent', 'child', 'guardian')),
  token text not null unique,
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists family_members_profile_idx
  on public.family_members (profile_id, family_id);
create index if not exists learning_goals_family_child_idx
  on public.learning_goals (family_id, child_profile_id, status);
create index if not exists learning_sessions_family_child_start_idx
  on public.learning_sessions (family_id, child_profile_id, starts_at desc);
create index if not exists session_events_session_time_idx
  on public.session_events (session_id, event_time);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists family_settings_set_updated_at on public.family_settings;
create trigger family_settings_set_updated_at
before update on public.family_settings
for each row execute function public.set_updated_at();
drop trigger if exists learning_goals_set_updated_at on public.learning_goals;
create trigger learning_goals_set_updated_at
before update on public.learning_goals
for each row execute function public.set_updated_at();
drop trigger if exists learning_sessions_set_updated_at on public.learning_sessions;
create trigger learning_sessions_set_updated_at
before update on public.learning_sessions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_settings enable row level security;
alter table public.learning_goals enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.session_events enable row level security;
alter table public.study_lock_events enable row level security;
alter table public.approvals enable row level security;
alter table public.ai_plans enable row level security;
alter table public.notifications enable row level security;
alter table public.family_invites enable row level security;

-- New objects start private. Later workflow migrations grant only the audited
-- RPC and read surfaces required by authenticated application sessions.
revoke all on all tables in schema public from anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
