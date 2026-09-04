-- Production reliability: recurring occurrences, server-authoritative sessions,
-- AI quotas and idempotent device delivery.

alter table public.family_settings
  add column if not exists timezone text not null default 'Asia/Ho_Chi_Minh',
  add column if not exists ai_daily_plan_limit integer not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'family_settings_ai_daily_plan_limit_check'
      and conrelid = 'public.family_settings'::regclass
  ) then
    alter table public.family_settings
      add constraint family_settings_ai_daily_plan_limit_check
      check (ai_daily_plan_limit between 0 and 100);
  end if;
end $$;

-- A managed child currently uses the parent's authenticated browser session.
-- Persist the selected mode against Supabase's auth session so changing local
-- state or the URL cannot re-enable parent mutations from DevTools.
create table if not exists private.app_device_modes (
  auth_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'child' check (mode = 'child'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists app_device_modes_user_expiry_idx
  on private.app_device_modes (user_id, expires_at);
revoke all on table private.app_device_modes from public, anon, authenticated, service_role;

create or replace function private.current_auth_session_id()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif((select auth.jwt()->>'session_id'), '');
$$;

create or replace function private.is_parent_account_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.family_members member
      where member.profile_id = (select auth.uid())
        and member.role = 'parent'
        and member.status = 'active'
    )
    and not exists (
      select 1 from private.app_device_modes device_mode
      where device_mode.auth_session_id = private.current_auth_session_id()
        and device_mode.user_id = (select auth.uid())
        and device_mode.mode = 'child'
        and device_mode.expires_at > now()
    );
$$;

create or replace function private.is_family_parent(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_parent_account_session()
    and exists (
      select 1 from public.family_members member
      where member.family_id = p_family_id
        and member.profile_id = (select auth.uid())
        and member.role = 'parent'
        and member.status = 'active'
    );
$$;

create or replace function private.can_run_child_workflow(
  p_family_id uuid,
  p_child_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members member
    where member.family_id = p_family_id
      and member.profile_id = (select auth.uid())
      and member.role = 'child'
      and member.status = 'active'
      and member.profile_id = p_child_profile_id
  ) or exists (
    select 1
    from public.family_members parent_member
    join private.app_device_modes device_mode
      on device_mode.user_id = parent_member.profile_id
     and device_mode.family_id = parent_member.family_id
    where parent_member.family_id = p_family_id
      and parent_member.profile_id = (select auth.uid())
      and parent_member.role = 'parent'
      and parent_member.status = 'active'
      and device_mode.auth_session_id = private.current_auth_session_id()
      and device_mode.child_profile_id = p_child_profile_id
      and device_mode.mode = 'child'
      and device_mode.expires_at > now()
  );
$$;

-- Read policies use the same session boundary as mutations. A parent-mode
-- session may read every owned child; a managed-child session may read only
-- the child selected before the hand-off.
create or replace function private.can_access_child(
  p_family_id uuid,
  p_child_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members child_member
    where child_member.family_id = p_family_id
      and child_member.profile_id = (select auth.uid())
      and child_member.role = 'child'
      and child_member.status = 'active'
      and child_member.profile_id = p_child_profile_id
  ) or (
    exists (
      select 1
      from public.family_members parent_member
      where parent_member.family_id = p_family_id
        and parent_member.profile_id = (select auth.uid())
        and parent_member.role = 'parent'
        and parent_member.status = 'active'
    )
    and (
      not exists (
        select 1
        from private.app_device_modes device_mode
        where device_mode.auth_session_id = private.current_auth_session_id()
          and device_mode.user_id = (select auth.uid())
          and device_mode.mode = 'child'
          and device_mode.expires_at > now()
      )
      or exists (
        select 1
        from private.app_device_modes device_mode
        where device_mode.auth_session_id = private.current_auth_session_id()
          and device_mode.user_id = (select auth.uid())
          and device_mode.family_id = p_family_id
          and device_mode.child_profile_id = p_child_profile_id
          and device_mode.mode = 'child'
          and device_mode.expires_at > now()
      )
    )
  );
$$;

revoke all on function private.current_auth_session_id() from public, anon, authenticated, service_role;
revoke all on function private.is_parent_account_session() from public, anon, authenticated, service_role;
revoke all on function private.is_family_parent(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_run_child_workflow(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_access_child(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_access_child(uuid, uuid) to authenticated;

create or replace function public.get_app_mode()
returns table (
  app_mode text,
  family_id uuid,
  child_profile_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id text := private.current_auth_session_id();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select 'child'::text, device_mode.family_id, device_mode.child_profile_id
  from private.app_device_modes device_mode
  where device_mode.auth_session_id = v_session_id
    and device_mode.user_id = v_user_id
    and device_mode.mode = 'child'
    and device_mode.expires_at > now()
  limit 1;
  if found then return; end if;

  return query
  select 'child'::text, member.family_id, member.profile_id
  from public.family_members member
  where member.profile_id = v_user_id
    and member.role = 'child'
    and member.status = 'active'
  order by member.joined_at, member.id
  limit 1;
  if found then return; end if;

  return query select 'parent'::text, null::uuid, null::uuid;
end;
$$;

revoke all on function public.get_app_mode() from public, anon;
grant execute on function public.get_app_mode() to authenticated;

create or replace function public.get_account_children()
returns table (
  account_space_id uuid,
  parent_profile_id uuid,
  child_profile_id uuid,
  child_name text,
  child_avatar_url text,
  child_grade_level smallint,
  child_joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    family.id,
    (select auth.uid()),
    child_profile.id,
    child_profile.full_name,
    child_profile.avatar_url,
    child_profile.grade_level,
    child_member.joined_at
  from public.families family
  join public.family_members child_member
    on child_member.family_id = family.id
   and child_member.role = 'child'
   and child_member.status = 'active'
  join public.profiles child_profile
    on child_profile.id = child_member.profile_id
  where family.created_by = (select auth.uid())
    and private.can_access_child(family.id, child_profile.id)
  order by child_member.joined_at, child_profile.id;
$$;

revoke all on function public.get_account_children() from public, anon;
grant execute on function public.get_account_children() to authenticated;

create or replace function public.enter_child_mode(
  p_family_id uuid,
  p_child_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id text := private.current_auth_session_id();
begin
  if v_user_id is null or v_session_id is null then
    raise exception 'Authenticated session required';
  end if;
  if not exists (
    select 1 from public.family_members member
    where member.family_id = p_family_id
      and member.profile_id = v_user_id
      and member.role = 'parent'
      and member.status = 'active'
  ) or not exists (
    select 1 from public.family_members child_member
    where child_member.family_id = p_family_id
      and child_member.profile_id = p_child_profile_id
      and child_member.role = 'child'
      and child_member.status = 'active'
  ) then
    raise exception 'Parent access required';
  end if;

  delete from private.app_device_modes stale
  where stale.user_id = v_user_id
    and stale.expires_at <= now();

  if exists (
    select 1
    from private.app_device_modes current_mode
    where current_mode.auth_session_id = v_session_id
      and current_mode.user_id = v_user_id
      and (
        current_mode.family_id <> p_family_id
        or current_mode.child_profile_id <> p_child_profile_id
      )
  ) then
    raise exception 'Parent re-authentication required to change child';
  end if;

  insert into private.app_device_modes (
    auth_session_id, user_id, family_id, child_profile_id, expires_at
  ) values (
    v_session_id, v_user_id, p_family_id, p_child_profile_id, now() + interval '30 days'
  ) on conflict (auth_session_id) do update
    set expires_at = excluded.expires_at;
  return true;
end;
$$;

revoke all on function public.enter_child_mode(uuid, uuid) from public, anon;
grant execute on function public.enter_child_mode(uuid, uuid) to authenticated;

create or replace function public.add_child_profile(p_child_name text)
returns table (
  account_space_id uuid,
  parent_profile_id uuid,
  child_profile_id uuid,
  child_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_parent_account_session() then raise exception 'Parent access required'; end if;
  return query select * from private.add_child_profile(p_child_name);
end;
$$;

create or replace function public.add_child_profile_with_grade(
  p_child_name text,
  p_grade_level smallint
)
returns table (
  account_space_id uuid,
  parent_profile_id uuid,
  child_profile_id uuid,
  child_name text,
  child_grade_level smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_parent_account_session() then raise exception 'Parent access required'; end if;
  return query select * from private.add_child_profile_with_grade(p_child_name, p_grade_level);
end;
$$;

create or replace function public.update_child_profile(
  p_child_profile_id uuid,
  p_child_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  select member.family_id into v_family_id
  from public.family_members member
  where member.profile_id = p_child_profile_id
    and member.role = 'child'
    and member.status = 'active'
  order by member.joined_at, member.id
  limit 1;
  if v_family_id is null or not private.is_family_parent(v_family_id) then
    raise exception 'Parent access required';
  end if;
  return private.update_child_profile(p_child_profile_id, p_child_name);
end;
$$;

create or replace function public.update_child_profile_details(
  p_child_profile_id uuid,
  p_child_name text,
  p_grade_level smallint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  select member.family_id into v_family_id
  from public.family_members member
  where member.profile_id = p_child_profile_id
    and member.role = 'child'
    and member.status = 'active'
  order by member.joined_at, member.id
  limit 1;
  if v_family_id is null or not private.is_family_parent(v_family_id) then
    raise exception 'Parent access required';
  end if;
  return private.update_child_profile_details(p_child_profile_id, p_child_name, p_grade_level);
end;
$$;

revoke all on function public.add_child_profile(text) from public, anon;
revoke all on function public.add_child_profile_with_grade(text, smallint) from public, anon;
revoke all on function public.update_child_profile(uuid, text) from public, anon;
revoke all on function public.update_child_profile_details(uuid, text, smallint) from public, anon;
grant execute on function public.add_child_profile(text) to authenticated;
grant execute on function public.add_child_profile_with_grade(text, smallint) to authenticated;
grant execute on function public.update_child_profile(uuid, text) to authenticated;
grant execute on function public.update_child_profile_details(uuid, text, smallint) to authenticated;

create table if not exists public.schedule_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_event_id uuid references public.schedule_events(id) on delete set null,
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  occurrence_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text not null,
  subject text,
  event_type text not null,
  study_lock_enabled boolean not null default false,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_occurrences_time_check check (ends_at > starts_at),
  constraint schedule_occurrences_status_check
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  constraint schedule_occurrences_event_type_check
    check (event_type in (
      'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other',
      'learning', 'routine'
    ))
);

create unique index if not exists schedule_occurrences_event_date_key
  on public.schedule_occurrences (schedule_event_id, occurrence_date)
  where schedule_event_id is not null;
create index if not exists schedule_occurrences_child_start_idx
  on public.schedule_occurrences (child_profile_id, starts_at, id);
create index if not exists schedule_occurrences_family_status_start_idx
  on public.schedule_occurrences (family_id, status, starts_at);

alter table public.learning_sessions
  add column if not exists schedule_event_id uuid,
  add column if not exists schedule_occurrence_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_sessions_schedule_event_id_fkey'
      and conrelid = 'public.learning_sessions'::regclass
  ) then
    alter table public.learning_sessions
      add constraint learning_sessions_schedule_event_id_fkey
      foreign key (schedule_event_id) references public.schedule_events(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_sessions_schedule_occurrence_id_fkey'
      and conrelid = 'public.learning_sessions'::regclass
  ) then
    alter table public.learning_sessions
      add constraint learning_sessions_schedule_occurrence_id_fkey
      foreign key (schedule_occurrence_id) references public.schedule_occurrences(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_sessions_schedule_occurrence_id_key'
      and conrelid = 'public.learning_sessions'::regclass
  ) then
    alter table public.learning_sessions
      add constraint learning_sessions_schedule_occurrence_id_key unique (schedule_occurrence_id);
  end if;
end $$;

create index if not exists learning_sessions_child_start_cursor_idx
  on public.learning_sessions (child_profile_id, starts_at desc, id desc);
create index if not exists learning_sessions_schedule_event_idx
  on public.learning_sessions (schedule_event_id);

-- Reconcile any legacy duplicate active sessions before enforcing the invariant.
with ranked_active as (
  select id,
         row_number() over (
           partition by child_profile_id
           order by actual_started_at desc nulls last, updated_at desc, id desc
         ) as position
  from public.learning_sessions
  where status = 'in_progress'
)
update public.learning_sessions session
set status = 'awaiting_parent',
    ends_at = coalesce(session.ends_at, now()),
    notes = coalesce(session.notes, 'Phiên trùng đã được đóng khi bật bảo vệ một phiên đang học.'),
    updated_at = now()
from ranked_active ranked
where session.id = ranked.id and ranked.position > 1;

create unique index if not exists learning_sessions_one_active_per_child
  on public.learning_sessions (child_profile_id)
  where status = 'in_progress';

alter table public.device_commands
  add column if not exists idempotency_key text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists last_attempt_at timestamptz;

alter table public.device_commands drop constraint if exists device_commands_status_check;
alter table public.device_commands
  add constraint device_commands_status_check
  check (status in ('queued', 'processing', 'sent', 'acknowledged', 'failed', 'configuration_required'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'device_commands_attempts_check'
      and conrelid = 'public.device_commands'::regclass
  ) then
    alter table public.device_commands
      add constraint device_commands_attempts_check
      check (attempt_count >= 0 and max_attempts between 1 and 20 and attempt_count <= max_attempts);
  end if;
end $$;

with ranked_commands as (
  select id,
         session_id,
         command,
         row_number() over (
           partition by session_id, command
           order by created_at, id
         ) as position
  from public.device_commands
  where session_id is not null
)
update public.device_commands command
set idempotency_key = case
  when ranked.position = 1 then ranked.session_id::text || ':' || ranked.command
  else ranked.session_id::text || ':' || ranked.command || ':legacy:' || ranked.id::text
end
from ranked_commands ranked
where command.id = ranked.id and command.idempotency_key is null;

update public.device_commands
set idempotency_key = id::text || ':' || command
where idempotency_key is null;

alter table public.device_commands alter column idempotency_key set not null;
create unique index if not exists device_commands_idempotency_key_idx
  on public.device_commands (idempotency_key);
create index if not exists device_commands_delivery_queue_idx
  on public.device_commands (next_attempt_at, created_at)
  where status in ('queued', 'failed', 'configuration_required', 'processing');

-- Compatibility guard for older private workflows that insert a command
-- without the new delivery metadata. New workflows provide a stable key
-- explicitly, while this trigger keeps legacy inserts safe during migration.
create or replace function private.prepare_device_command_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.idempotency_key := coalesce(
    nullif(trim(new.idempotency_key), ''),
    case
      when new.session_id is not null then new.session_id::text || ':' || new.command
      else new.id::text || ':' || new.command
    end
  );
  new.next_attempt_at := coalesce(new.next_attempt_at, now());
  return new;
end;
$$;

revoke all on function private.prepare_device_command_delivery()
  from public, anon, authenticated, service_role;
drop trigger if exists device_commands_prepare_delivery on public.device_commands;
create trigger device_commands_prepare_delivery
before insert on public.device_commands
for each row execute function private.prepare_device_command_delivery();

create table if not exists public.ai_usage_windows (
  family_id uuid not null references public.families(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (family_id, profile_id, usage_date)
);

alter table public.schedule_occurrences enable row level security;
alter table public.ai_usage_windows enable row level security;

drop policy if exists "parents and child read occurrences" on public.schedule_occurrences;
create policy "parents and child read occurrences"
  on public.schedule_occurrences for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "parents read own ai usage" on public.ai_usage_windows;
create policy "parents read own ai usage"
  on public.ai_usage_windows for select to authenticated
  using (
    profile_id = (select auth.uid())
    and (select private.is_family_parent(family_id))
  );

revoke all on table public.schedule_occurrences, public.ai_usage_windows from public, anon, authenticated;
grant select on table public.schedule_occurrences, public.ai_usage_windows to authenticated;

create or replace function public.clear_child_data(p_child_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_occurrence_count integer := 0;
  v_legacy_count integer := 0;
begin
  select member.family_id into v_family_id
  from public.family_members member
  where member.profile_id = p_child_profile_id
    and member.role = 'child'
    and member.status = 'active'
  order by member.joined_at, member.id
  limit 1;
  if v_family_id is null or not private.is_family_parent(v_family_id) then
    raise exception 'Parent access required';
  end if;

  -- Sessions are deleted by the existing implementation. Removing occurrences
  -- first also removes the generated schedule history requested by this action.
  delete from public.schedule_occurrences
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  get diagnostics v_occurrence_count = row_count;
  v_legacy_count := private.clear_child_data(p_child_profile_id);
  return v_occurrence_count + v_legacy_count;
end;
$$;

revoke all on function public.clear_child_data(uuid) from public, anon;
grant execute on function public.clear_child_data(uuid) to authenticated;

-- These implementations were executable by authenticated in older migrations.
-- Public security-definer wrappers above are now the only mutation boundary.
revoke all on function private.add_child_profile(text)
  from public, anon, authenticated, service_role;
revoke all on function private.add_child_profile_with_grade(text, smallint)
  from public, anon, authenticated, service_role;
revoke all on function private.update_child_profile(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.update_child_profile_details(uuid, text, smallint)
  from public, anon, authenticated, service_role;
revoke all on function private.clear_child_data(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.materialize_schedule_window(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_from_date date default null,
  p_days integer default 42
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_from_date date;
  v_count integer := 0;
begin
  if p_days < 1 or p_days > 90 then raise exception 'Materialization window must be between 1 and 90 days'; end if;
  select coalesce(nullif(settings.timezone, ''), 'Asia/Ho_Chi_Minh')
  into v_timezone
  from public.family_settings settings
  where settings.family_id = p_family_id;
  v_timezone := coalesce(v_timezone, 'Asia/Ho_Chi_Minh');
  v_from_date := coalesce(p_from_date, (now() at time zone v_timezone)::date);

  insert into public.schedule_occurrences (
    schedule_event_id, family_id, child_profile_id, occurrence_date,
    starts_at, ends_at, title, subject, event_type, study_lock_enabled, status
  )
  select
    event.id,
    event.family_id,
    event.child_profile_id,
    calendar.day::date,
    (calendar.day::date + event.start_time) at time zone v_timezone,
    ((calendar.day::date + event.start_time) at time zone v_timezone)
      + make_interval(mins => event.duration_minutes),
    event.title,
    event.subject,
    event.event_type,
    event.study_lock_enabled,
    'scheduled'
  from public.schedule_events event
  cross join generate_series(
    v_from_date::timestamp,
    (v_from_date + p_days - 1)::timestamp,
    interval '1 day'
  ) calendar(day)
  where event.family_id = p_family_id
    and event.child_profile_id = p_child_profile_id
    and event.day_of_week = (array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[
      extract(isodow from calendar.day)::integer
    ]
  on conflict (schedule_event_id, occurrence_date) where schedule_event_id is not null
  do update set
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    title = excluded.title,
    subject = excluded.subject,
    event_type = excluded.event_type,
    study_lock_enabled = excluded.study_lock_enabled,
    status = case
      when schedule_occurrences.status in ('in_progress', 'completed') then schedule_occurrences.status
      else 'scheduled'
    end,
    updated_at = now();
  get diagnostics v_count = row_count;

  insert into public.learning_sessions (
    family_id, child_profile_id, goal_id, schedule_event_id, schedule_occurrence_id,
    title, subject, starts_at, duration_minutes, status, tasks_total, approval_policy
  )
  select
    occurrence.family_id,
    occurrence.child_profile_id,
    goal.id,
    occurrence.schedule_event_id,
    occurrence.id,
    occurrence.title,
    coalesce(occurrence.subject, occurrence.title),
    occurrence.starts_at,
    greatest(1, round(extract(epoch from occurrence.ends_at - occurrence.starts_at) / 60)::integer),
    'scheduled',
    0,
    case when settings.default_approval_mode = 'auto' then 'auto_approve' else 'parent_required' end
  from public.schedule_occurrences occurrence
  left join lateral (
    select candidate.id
    from public.learning_goals candidate
    where candidate.family_id = occurrence.family_id
      and candidate.child_profile_id = occurrence.child_profile_id
      and candidate.subject = occurrence.subject
      and candidate.status = 'active'
    order by candidate.created_at desc, candidate.id desc
    limit 1
  ) goal on true
  left join public.family_settings settings on settings.family_id = occurrence.family_id
  where occurrence.family_id = p_family_id
    and occurrence.child_profile_id = p_child_profile_id
    and occurrence.status = 'scheduled'
    and occurrence.event_type in ('school', 'extra', 'self_study', 'learning')
  on conflict (schedule_occurrence_id) do update set
    schedule_event_id = excluded.schedule_event_id,
    title = excluded.title,
    subject = excluded.subject,
    starts_at = excluded.starts_at,
    duration_minutes = excluded.duration_minutes,
    goal_id = excluded.goal_id,
    approval_policy = excluded.approval_policy,
    updated_at = now()
  where learning_sessions.status = 'scheduled';

  return v_count;
end;
$$;

revoke all on function private.materialize_schedule_window(uuid, uuid, date, integer)
  from public, anon, authenticated, service_role;

create or replace function private.save_schedule_setup_impl(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_event_id uuid;
  v_keep_ids uuid[] := array[]::uuid[];
  v_count integer;
begin
  if jsonb_typeof(coalesce(p_events, '[]'::jsonb)) <> 'array' then
    raise exception 'Schedule events must be an array';
  end if;
  v_count := jsonb_array_length(coalesce(p_events, '[]'::jsonb));
  if v_count > 100 then raise exception 'A schedule cannot contain more than 100 items'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_family_id::text || ':' || p_child_profile_id::text, 0));

  for v_item in select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
  loop
    if v_item->>'event_type' not in (
      'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other',
      'learning', 'routine'
    )
      or v_item->>'day_of_week' not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
      or nullif(trim(v_item->>'title'), '') is null
      or length(trim(v_item->>'title')) > 120
      or (
        v_item->>'event_type' in ('school', 'extra', 'self_study', 'learning')
        and nullif(trim(v_item->>'subject'), '') is null
      )
      or coalesce((v_item->>'duration_minutes')::integer, 0) not between 5 and 720
      or (
        v_item->>'event_type' in ('school', 'extra', 'self_study', 'learning')
        and not coalesce((v_item->>'study_lock_enabled')::boolean, false)
      ) then
      raise exception 'Invalid schedule item';
    end if;

    if nullif(v_item->>'id', '') is not null then
      update public.schedule_events
      set title = trim(v_item->>'title'),
          event_type = v_item->>'event_type',
          subject = nullif(trim(v_item->>'subject'), ''),
          day_of_week = v_item->>'day_of_week',
          start_time = (v_item->>'start_time')::time,
          duration_minutes = (v_item->>'duration_minutes')::integer,
          status = 'upcoming',
          sort_order = coalesce((v_item->>'sort_order')::integer, 0),
          study_lock_enabled = coalesce((v_item->>'study_lock_enabled')::boolean, false),
          updated_at = now()
      where id = (v_item->>'id')::uuid
        and family_id = p_family_id
        and child_profile_id = p_child_profile_id
      returning id into v_event_id;
      if v_event_id is null then raise exception 'Schedule item not found'; end if;
    else
      insert into public.schedule_events (
        family_id, child_profile_id, title, event_type, subject, day_of_week,
        start_time, duration_minutes, status, sort_order, study_lock_enabled
      ) values (
        p_family_id,
        p_child_profile_id,
        trim(v_item->>'title'),
        v_item->>'event_type',
        nullif(trim(v_item->>'subject'), ''),
        v_item->>'day_of_week',
        (v_item->>'start_time')::time,
        (v_item->>'duration_minutes')::integer,
        'upcoming',
        coalesce((v_item->>'sort_order')::integer, 0),
        coalesce((v_item->>'study_lock_enabled')::boolean, false)
      ) returning id into v_event_id;
    end if;
    v_keep_ids := array_append(v_keep_ids, v_event_id);
    v_event_id := null;
  end loop;

  if exists (
    select 1
    from public.schedule_events first_event
    join public.schedule_events second_event
      on second_event.family_id = first_event.family_id
     and second_event.child_profile_id = first_event.child_profile_id
     and second_event.day_of_week = first_event.day_of_week
     and second_event.id > first_event.id
    where first_event.family_id = p_family_id
      and first_event.child_profile_id = p_child_profile_id
      and (date '2000-01-01' + first_event.start_time)
          < (date '2000-01-01' + second_event.start_time + make_interval(mins => second_event.duration_minutes))
      and (date '2000-01-01' + second_event.start_time)
          < (date '2000-01-01' + first_event.start_time + make_interval(mins => first_event.duration_minutes))
  ) then
    raise exception 'Schedule items overlap';
  end if;

  update public.schedule_occurrences
  set status = 'cancelled', updated_at = now()
  where family_id = p_family_id
    and child_profile_id = p_child_profile_id
    and starts_at > now()
    and status = 'scheduled';

  delete from public.schedule_events
  where family_id = p_family_id
    and child_profile_id = p_child_profile_id
    and not (id = any(v_keep_ids));

  perform private.materialize_schedule_window(p_family_id, p_child_profile_id, null, 42);

  -- Materialization restores retained occurrences to `scheduled`. Only sessions
  -- whose occurrence stayed cancelled belong to a removed/changed slot.
  update public.learning_sessions session
  set status = 'cancelled', updated_at = now()
  where session.family_id = p_family_id
    and session.child_profile_id = p_child_profile_id
    and session.status = 'scheduled'
    and exists (
      select 1 from public.schedule_occurrences occurrence
      where occurrence.id = session.schedule_occurrence_id
        and occurrence.status = 'cancelled'
    );

  return v_count;
end;
$$;

revoke all on function private.save_schedule_setup_impl(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.apply_week_plan_impl(
  p_plan_id uuid,
  p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ai_plans%rowtype;
  v_item jsonb;
  v_event_id uuid;
  v_changed_ids uuid[] := array[]::uuid[];
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_events, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_events, '[]'::jsonb)) > 100 then
    raise exception 'Plan events must be an array of at most 100 items';
  end if;

  select * into v_plan from public.ai_plans where id = p_plan_id for update;
  if v_plan.id is null or not private.is_family_parent(v_plan.family_id) then
    raise exception 'Plan not found';
  end if;
  if v_plan.status not in ('generated', 'accepted') then
    raise exception 'Plan cannot be applied from status %', v_plan.status;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_plan.family_id::text || ':' || v_plan.child_profile_id::text, 0));

  for v_item in select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
  loop
    if v_item->>'event_type' <> 'self_study'
       or v_item->>'day_of_week' not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
       or nullif(trim(v_item->>'title'), '') is null
       or nullif(trim(v_item->>'subject'), '') is null
       or length(trim(v_item->>'title')) > 120
       or length(trim(v_item->>'subject')) > 100
       or coalesce((v_item->>'duration_minutes')::integer, 0) not between 5 and 120 then
      raise exception 'Invalid plan schedule item';
    end if;

    if nullif(v_item->>'id', '') is not null then
      update public.schedule_events
      set day_of_week = v_item->>'day_of_week',
          start_time = (v_item->>'start_time')::time,
          duration_minutes = (v_item->>'duration_minutes')::integer,
          title = trim(v_item->>'title'),
          subject = trim(v_item->>'subject'),
          event_type = 'self_study',
          status = 'upcoming',
          sort_order = coalesce((v_item->>'sort_order')::integer, sort_order),
          study_lock_enabled = true,
          updated_at = now()
      where id = (v_item->>'id')::uuid
        and family_id = v_plan.family_id
        and child_profile_id = v_plan.child_profile_id
        and event_type in ('self_study', 'learning')
      returning id into v_event_id;
      if v_event_id is null then raise exception 'Plan schedule item not found'; end if;
    else
      insert into public.schedule_events (
        family_id, child_profile_id, title, event_type, subject, day_of_week,
        start_time, duration_minutes, status, sort_order, study_lock_enabled
      ) values (
        v_plan.family_id, v_plan.child_profile_id, trim(v_item->>'title'),
        'self_study', trim(v_item->>'subject'), v_item->>'day_of_week',
        (v_item->>'start_time')::time, (v_item->>'duration_minutes')::integer,
        'upcoming', coalesce((v_item->>'sort_order')::integer, 0), true
      ) returning id into v_event_id;
    end if;
    v_changed_ids := array_append(v_changed_ids, v_event_id);
    v_event_id := null;
    v_count := v_count + 1;
  end loop;

  if exists (
    select 1
    from public.schedule_events first_event
    join public.schedule_events second_event
      on second_event.family_id = first_event.family_id
     and second_event.child_profile_id = first_event.child_profile_id
     and second_event.day_of_week = first_event.day_of_week
     and second_event.id > first_event.id
    where first_event.family_id = v_plan.family_id
      and first_event.child_profile_id = v_plan.child_profile_id
      and (date '2000-01-01' + first_event.start_time)
          < (date '2000-01-01' + second_event.start_time + make_interval(mins => second_event.duration_minutes))
      and (date '2000-01-01' + second_event.start_time)
          < (date '2000-01-01' + first_event.start_time + make_interval(mins => first_event.duration_minutes))
  ) then
    raise exception 'Schedule items overlap';
  end if;

  update public.schedule_occurrences
  set status = 'cancelled', updated_at = now()
  where schedule_event_id = any(v_changed_ids)
    and starts_at > now()
    and status = 'scheduled';

  perform private.materialize_schedule_window(v_plan.family_id, v_plan.child_profile_id, null, 42);

  update public.learning_sessions session
  set status = 'cancelled', updated_at = now()
  where session.family_id = v_plan.family_id
    and session.child_profile_id = v_plan.child_profile_id
    and session.status = 'scheduled'
    and exists (
      select 1 from public.schedule_occurrences occurrence
      where occurrence.id = session.schedule_occurrence_id
        and occurrence.status = 'cancelled'
    );

  update public.ai_plans set status = 'executed' where id = p_plan_id;
  return v_count;
end;
$$;

revoke all on function private.apply_week_plan_impl(uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.enqueue_device_command(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_session_id uuid,
  p_command text,
  p_policy text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command_id uuid;
begin
  if p_command not in ('lock', 'unlock') then raise exception 'Invalid device command'; end if;
  insert into public.device_commands (
    family_id, child_profile_id, session_id, command, policy, requested_by,
    status, idempotency_key, next_attempt_at
  ) values (
    p_family_id, p_child_profile_id, p_session_id, p_command, p_policy, p_requested_by,
    'queued', p_session_id::text || ':' || p_command, now()
  )
  on conflict (idempotency_key) do update set
    next_attempt_at = case
      when device_commands.status in ('failed', 'configuration_required')
        and device_commands.attempt_count < device_commands.max_attempts then now()
      else device_commands.next_attempt_at
    end,
    status = case
      when device_commands.status in ('failed', 'configuration_required')
        and device_commands.attempt_count < device_commands.max_attempts then 'queued'
      else device_commands.status
    end
  returning id into v_command_id;
  return v_command_id;
end;
$$;

revoke all on function private.enqueue_device_command(uuid, uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.start_learning_session_impl(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_command_id uuid;
  v_timezone text;
  v_occurrence_date date;
begin
  select * into v_session
  from public.learning_sessions
  where id = p_session_id
  for update;
  if v_session.id is null then raise exception 'Learning session not found'; end if;
  if v_session.status not in ('scheduled', 'rejected') then
    raise exception 'Session cannot start from status %', v_session.status;
  end if;

  select coalesce(nullif(settings.timezone, ''), 'Asia/Ho_Chi_Minh')
  into v_timezone
  from public.family_settings settings
  where settings.family_id = v_session.family_id;
  v_timezone := coalesce(v_timezone, 'Asia/Ho_Chi_Minh');

  select occurrence.occurrence_date into v_occurrence_date
  from public.schedule_occurrences occurrence
  where occurrence.id = v_session.schedule_occurrence_id;
  v_occurrence_date := coalesce(
    v_occurrence_date,
    (v_session.starts_at at time zone v_timezone)::date
  );
  if v_occurrence_date <> (now() at time zone v_timezone)::date then
    raise exception 'Session can only start on its scheduled date';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_session.child_profile_id::text, 0));
  if exists (
    select 1 from public.learning_sessions active
    where active.child_profile_id = v_session.child_profile_id
      and active.status = 'in_progress'
      and active.id <> p_session_id
  ) then
    raise exception 'Another learning session is already in progress';
  end if;

  update public.learning_sessions
  set status = 'in_progress', actual_started_at = now(), ends_at = null, updated_at = now()
  where id = p_session_id;

  insert into public.session_events (session_id, event_type)
  values (p_session_id, 'start');

  -- Every learning session is focus-locked. Non-learning schedule occurrences
  -- never materialize a learning_session row.
  insert into public.study_lock_events (
    family_id, child_profile_id, session_id, action, reason, triggered_by
  )
  select v_session.family_id, v_session.child_profile_id, p_session_id,
         'locked', 'Buổi học bắt đầu.', (select auth.uid())
  where not exists (
    select 1 from public.study_lock_events event
    where event.session_id = p_session_id and event.action = 'locked'
  );
  v_command_id := private.enqueue_device_command(
    v_session.family_id, v_session.child_profile_id, p_session_id,
    'lock', 'study_only', (select auth.uid())
  );
  return v_command_id;
end;
$$;

revoke all on function private.start_learning_session_impl(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.approve_learning_session_impl(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_command_id uuid;
begin
  select * into v_session from public.learning_sessions where id = p_session_id for update;
  if v_session.id is null then raise exception 'Learning session not found'; end if;
  if v_session.status <> 'awaiting_parent' then raise exception 'Session is not awaiting approval'; end if;

  update public.learning_sessions set status = 'approved', updated_at = now() where id = p_session_id;
  update public.approvals
  set decision = 'approved', approved_by = (select auth.uid()), reviewed_at = now(),
      reason = 'Phụ huynh đã xác nhận kết quả.'
  where session_id = p_session_id;

  if exists (
    select 1 from public.device_commands command
    where command.session_id = p_session_id and command.command = 'lock'
  ) then
    insert into public.session_events (session_id, event_type)
    select p_session_id, 'unlock'
    where not exists (
      select 1 from public.session_events event
      where event.session_id = p_session_id and event.event_type = 'unlock'
    );
    insert into public.study_lock_events (
      family_id, child_profile_id, session_id, action, reason, triggered_by
    )
    select v_session.family_id, v_session.child_profile_id, p_session_id,
           'unlocked', 'Phụ huynh xác nhận kết quả.', (select auth.uid())
    where not exists (
      select 1 from public.study_lock_events event
      where event.session_id = p_session_id and event.action = 'unlocked'
    );
    v_command_id := private.enqueue_device_command(
      v_session.family_id, v_session.child_profile_id, p_session_id,
      'unlock', null, (select auth.uid())
    );
  end if;
  return v_command_id;
end;
$$;

revoke all on function private.approve_learning_session_impl(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.sync_session_occurrence_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.schedule_occurrence_id is null or new.status = old.status then return new; end if;
  update public.schedule_occurrences
  set status = case
        when new.status = 'in_progress' then 'in_progress'
        when new.status in ('awaiting_parent', 'approved', 'completed') then 'completed'
        when new.status = 'cancelled' then 'cancelled'
        else status
      end,
      updated_at = now()
  where id = new.schedule_occurrence_id;
  return new;
end;
$$;

revoke all on function private.sync_session_occurrence_status()
  from public, anon, authenticated, service_role;
drop trigger if exists learning_sessions_sync_occurrence on public.learning_sessions;
create trigger learning_sessions_sync_occurrence
after update of status on public.learning_sessions
for each row execute function private.sync_session_occurrence_status();

create or replace function private.enforce_server_session_duration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'in_progress'
     and new.status in ('awaiting_parent', 'approved', 'completed')
     and old.actual_started_at is not null then
    new.ends_at := coalesce(new.ends_at, now());
    new.duration_minutes := greatest(
      1,
      least(1440, floor(extract(epoch from (new.ends_at - old.actual_started_at)) / 60)::integer)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_server_session_duration()
  from public, anon, authenticated, service_role;
drop trigger if exists learning_sessions_server_duration on public.learning_sessions;
create trigger learning_sessions_server_duration
before update of status on public.learning_sessions
for each row execute function private.enforce_server_session_duration();

create or replace function public.claim_ai_plan_quota(
  p_family_id uuid,
  p_child_profile_id uuid
)
returns table (remaining integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_timezone text;
  v_limit integer;
  v_usage_date date;
  v_count integer;
begin
  if v_user_id is null or not private.is_family_parent(p_family_id) then
    raise exception 'Parent access required';
  end if;
  if not exists (
    select 1 from public.family_members member
    where member.family_id = p_family_id
      and member.profile_id = p_child_profile_id
      and member.role = 'child'
      and member.status = 'active'
  ) then
    raise exception 'Child profile is not in this account';
  end if;

  select coalesce(nullif(settings.timezone, ''), 'Asia/Ho_Chi_Minh'),
         settings.ai_daily_plan_limit
  into v_timezone, v_limit
  from public.family_settings settings
  where settings.family_id = p_family_id;
  v_timezone := coalesce(v_timezone, 'Asia/Ho_Chi_Minh');
  v_limit := coalesce(v_limit, 5);
  if v_limit = 0 then raise exception 'AI_DAILY_QUOTA_EXCEEDED'; end if;
  v_usage_date := (now() at time zone v_timezone)::date;

  insert into public.ai_usage_windows (family_id, profile_id, usage_date, request_count)
  values (p_family_id, v_user_id, v_usage_date, 1)
  on conflict (family_id, profile_id, usage_date) do update
  set request_count = ai_usage_windows.request_count + 1,
      updated_at = now()
  where ai_usage_windows.request_count < v_limit
  returning request_count into v_count;

  if v_count is null or v_count > v_limit then raise exception 'AI_DAILY_QUOTA_EXCEEDED'; end if;
  return query select v_limit - v_count,
    ((v_usage_date + 1)::timestamp at time zone v_timezone);
end;
$$;

revoke all on function public.claim_ai_plan_quota(uuid, uuid) from public, anon;
grant execute on function public.claim_ai_plan_quota(uuid, uuid) to authenticated;

create or replace function public.claim_device_command(p_command_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role access required';
  end if;
  update public.device_commands
  set status = 'processing',
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      error_message = null
  where id = p_command_id
    and attempt_count < max_attempts
    and (
      (status in ('queued', 'failed', 'configuration_required') and next_attempt_at <= now())
      or (status = 'processing' and last_attempt_at < now() - interval '2 minutes')
    );
  return found;
end;
$$;

revoke all on function public.claim_device_command(uuid) from public, anon, authenticated;
grant execute on function public.claim_device_command(uuid) to service_role;

create or replace function public.update_device_command_delivery(
  p_command_id uuid,
  p_status text,
  p_external_id text default null,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role access required';
  end if;
  if p_status not in ('sent', 'acknowledged', 'failed', 'configuration_required') then
    raise exception 'Invalid command delivery status';
  end if;

  update public.device_commands
  set status = p_status,
      external_id = coalesce(nullif(trim(p_external_id), ''), external_id),
      error_message = nullif(trim(p_error_message), ''),
      processed_at = case when p_status in ('sent', 'acknowledged') then now() else processed_at end,
      next_attempt_at = case
        when p_status in ('failed', 'configuration_required') and attempt_count < max_attempts
          then now() + make_interval(secs => least(300, (5 * power(2, greatest(attempt_count - 1, 0)))::integer))
        else next_attempt_at
      end
  where id = p_command_id
    and status in ('processing', 'sent', 'acknowledged');
  return found;
end;
$$;

revoke all on function public.update_device_command_delivery(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_device_command_delivery(uuid, text, text, text)
  to service_role;

create or replace function private.recover_study_lock_timeouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_count integer := 0;
  v_requested_by uuid;
begin
  for v_session in
    select session.*
    from public.learning_sessions session
    where session.status = 'in_progress'
      and session.actual_started_at is not null
      and session.actual_started_at
          + make_interval(mins => least(coalesce(session.duration_minutes, 60) + 30, 750)) <= now()
      and exists (
        select 1 from public.device_commands command
        where command.session_id = session.id and command.command = 'lock'
      )
      and not exists (
        select 1 from public.device_commands command
        where command.session_id = session.id and command.command = 'unlock'
      )
    order by session.child_profile_id, session.actual_started_at
    for update skip locked
  loop
    select member.profile_id into v_requested_by
    from public.family_members member
    where member.family_id = v_session.family_id
      and member.role = 'parent'
      and member.status = 'active'
    order by member.joined_at, member.profile_id
    limit 1;
    v_requested_by := coalesce(v_requested_by, v_session.child_profile_id);

    update public.learning_sessions
    set status = 'awaiting_parent', ends_at = now(),
        notes = 'Study Lock được mở tự động do buổi học vượt quá thời gian an toàn.',
        updated_at = now()
    where id = v_session.id;

    insert into public.study_lock_events (
      family_id, child_profile_id, session_id, action, reason, triggered_by
    ) values (
      v_session.family_id, v_session.child_profile_id, v_session.id,
      'unlocked', 'Tự phục hồi sau timeout an toàn.', v_requested_by
    );
    perform private.enqueue_device_command(
      v_session.family_id, v_session.child_profile_id, v_session.id,
      'unlock', 'safety_timeout', v_requested_by
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.recover_study_lock_timeouts()
  from public, anon, authenticated, service_role;

create or replace function private.materialize_all_schedule_windows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_child record;
  v_count integer := 0;
begin
  for v_child in
    select distinct event.family_id, event.child_profile_id
    from public.schedule_events event
    order by event.family_id, event.child_profile_id
  loop
    v_count := v_count + private.materialize_schedule_window(
      v_child.family_id, v_child.child_profile_id, null, 42
    );
  end loop;
  return v_count;
end;
$$;

revoke all on function private.materialize_all_schedule_windows()
  from public, anon, authenticated, service_role;

-- Materialize the first rolling window before enabling scheduled maintenance.
select private.materialize_all_schedule_windows();
select private.recover_study_lock_timeouts();

create extension if not exists pg_cron;
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job
    where jobname in (
      'genai-family-reliability',
      'genai-family-materialize-occurrences',
      'genai-family-study-lock-recovery'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'genai-family-materialize-occurrences',
    '15 2 * * *',
    'select private.materialize_all_schedule_windows();'
  );
  perform cron.schedule(
    'genai-family-study-lock-recovery',
    '*/5 * * * *',
    'select private.recover_study_lock_timeouts();'
  );
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'schedule_occurrences'
     ) then
    alter publication supabase_realtime add table public.schedule_occurrences;
  end if;
end $$;

notify pgrst, 'reload schema';
