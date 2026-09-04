-- Replace the public demo surface with authenticated, family-scoped workflows.
-- This migration deliberately keeps the existing CRM bootstrap behavior in the
-- auth trigger because this Supabase project is shared with another application.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

create or replace function private.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = (select auth.uid())
      and fm.status = 'active'
  );
$$;

create or replace function private.is_family_parent(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = (select auth.uid())
      and fm.role = 'parent'
      and fm.status = 'active'
  );
$$;

create or replace function private.can_read_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = (select auth.uid()) or exists (
    select 1
    from public.family_members mine
    join public.family_members theirs on theirs.family_id = mine.family_id
    where mine.profile_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.profile_id = p_profile_id
      and theirs.status = 'active'
  );
$$;

revoke all on function private.is_family_member(uuid) from public, anon, authenticated, service_role;
revoke all on function private.is_family_parent(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_read_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.is_family_parent(uuid) to authenticated;
grant execute on function private.can_read_profile(uuid) to authenticated;

alter table public.learning_sessions
  add column if not exists actual_started_at timestamptz;

alter table public.schedule_events
  add column if not exists study_lock_enabled boolean not null default true;

alter table public.schedule_events
  drop constraint if exists schedule_events_event_type_check;
alter table public.schedule_events
  add constraint schedule_events_event_type_check
  check (event_type in (
    'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other',
    'learning', 'routine'
  ));

alter table public.session_events
  drop constraint if exists session_events_event_type_check;
alter table public.session_events
  add constraint session_events_event_type_check
  check (event_type in ('start', 'pause', 'resume', 'finish', 'checkpoint', 'warning', 'unlock', 'break_requested'));

create table if not exists public.session_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.learning_sessions(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quick_check_questions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  subject text not null,
  prompt text not null check (length(trim(prompt)) > 0),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  correct_option integer not null check (correct_option >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_check_correct_option_in_range
    check (correct_option < jsonb_array_length(options))
);

create table if not exists public.quick_check_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.learning_sessions(id) on delete cascade,
  question_id uuid not null references public.quick_check_questions(id) on delete cascade,
  selected_option integer not null check (selected_option >= 0),
  is_correct boolean not null,
  answered_by uuid not null references public.profiles(id),
  answered_at timestamptz not null default now(),
  unique (session_id, question_id)
);

alter table public.quick_check_answers
  add column if not exists answered_by uuid references public.profiles(id),
  add column if not exists answered_at timestamptz default now();

update public.quick_check_answers answer
set answered_by = session.child_profile_id
from public.learning_sessions session
where session.id = answer.session_id
  and answer.answered_by is null;
update public.quick_check_answers set answered_at = now() where answered_at is null;
alter table public.quick_check_answers alter column answered_by set not null;
alter table public.quick_check_answers alter column answered_at set not null;
create unique index if not exists quick_check_answers_session_question_key
  on public.quick_check_answers (session_id, question_id);

create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id),
  session_id uuid references public.learning_sessions(id) on delete set null,
  command text not null check (command in ('lock', 'unlock')),
  policy text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'acknowledged', 'failed', 'configuration_required')),
  requested_by uuid not null references public.profiles(id),
  external_id text,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.device_commands
  add column if not exists external_id text,
  add column if not exists error_message text,
  add column if not exists processed_at timestamptz;
alter table public.device_commands
  drop constraint if exists device_commands_status_check;
update public.device_commands
set status = case status
  when 'pending' then 'queued'
  when 'dispatched' then 'sent'
  when 'applied' then 'acknowledged'
  else status
end;
alter table public.device_commands alter column status set default 'queued';
alter table public.device_commands
  add constraint device_commands_status_check
  check (status in ('queued', 'sent', 'acknowledged', 'failed', 'configuration_required'));

-- Repair users created before the Auth trigger was installed. This does not
-- touch existing profile rows used by the CRM application.
insert into public.profiles (id, email, full_name, role)
select
  auth_user.id,
  coalesce(auth_user.email, auth_user.id::text || '@users.invalid'),
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
    'Người dùng'
  ),
  case
    when auth_user.raw_user_meta_data->>'role' in ('parent', 'child', 'admin')
      then auth_user.raw_user_meta_data->>'role'
    else 'parent'
  end
from auth.users auth_user
on conflict (id) do nothing;

create unique index if not exists approvals_session_id_key
  on public.approvals (session_id);
create index if not exists session_tasks_session_sort_idx
  on public.session_tasks (session_id, sort_order);
create index if not exists quick_check_questions_family_subject_idx
  on public.quick_check_questions (family_id, subject, active, sort_order);
create index if not exists quick_check_answers_session_idx
  on public.quick_check_answers (session_id);
create index if not exists quick_check_answers_question_idx
  on public.quick_check_answers (question_id);
create index if not exists quick_check_answers_answered_by_idx
  on public.quick_check_answers (answered_by);
create index if not exists device_commands_family_created_idx
  on public.device_commands (family_id, created_at desc);
create index if not exists device_commands_child_profile_idx
  on public.device_commands (child_profile_id);
create index if not exists device_commands_session_idx
  on public.device_commands (session_id);
create index if not exists device_commands_requested_by_idx
  on public.device_commands (requested_by);
create index if not exists family_members_profile_status_idx
  on public.family_members (profile_id, status, family_id);
create index if not exists ai_plans_child_profile_idx
  on public.ai_plans (child_profile_id);
create index if not exists approvals_approved_by_idx
  on public.approvals (approved_by);
create index if not exists approvals_family_idx
  on public.approvals (family_id);
create index if not exists approvals_requested_by_idx
  on public.approvals (requested_by);
create index if not exists family_invites_family_idx
  on public.family_invites (family_id);
create index if not exists family_invites_invited_by_idx
  on public.family_invites (invited_by);
create index if not exists learning_goals_created_by_idx
  on public.learning_goals (created_by);
create index if not exists learning_sessions_goal_idx
  on public.learning_sessions (goal_id);
create index if not exists notifications_family_idx
  on public.notifications (family_id);
create index if not exists notifications_sender_idx
  on public.notifications (sender_id);
create index if not exists study_lock_events_child_profile_idx
  on public.study_lock_events (child_profile_id);
create index if not exists study_lock_events_triggered_by_idx
  on public.study_lock_events (triggered_by);

drop trigger if exists trg_schedule_events_updated_at on public.schedule_events;
create trigger trg_schedule_events_updated_at
  before update on public.schedule_events
  for each row execute function public.set_updated_at();
drop trigger if exists trg_session_tasks_updated_at on public.session_tasks;
create trigger trg_session_tasks_updated_at
  before update on public.session_tasks
  for each row execute function public.set_updated_at();
drop trigger if exists trg_quick_check_questions_updated_at on public.quick_check_questions;
create trigger trg_quick_check_questions_updated_at
  before update on public.quick_check_questions
  for each row execute function public.set_updated_at();

alter table public.session_tasks enable row level security;
alter table public.quick_check_questions enable row level security;
alter table public.quick_check_answers enable row level security;
alter table public.device_commands enable row level security;

-- Replace policies only on tables owned by this application. Profiles are
-- shared with CRM, so only this app's legacy/profile policies are replaced.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        tablename = any(array[
          'families', 'family_members', 'family_settings', 'learning_goals',
          'learning_sessions', 'session_events', 'study_lock_events',
          'approvals', 'ai_plans', 'notifications', 'family_invites',
          'schedule_events', 'exceptions', 'session_tasks',
          'quick_check_questions', 'quick_check_answers', 'device_commands'
        ])
        or (
          tablename = 'profiles'
          and (
            policyname like 'demo %'
            or policyname like 'allow_all_auth_on_%'
            or policyname in ('members read profiles', 'users update own profile')
          )
        )
      )
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end;
$$;

drop policy if exists "family invites are private" on public.family_invites;

create policy "members read families"
  on public.families for select to authenticated
  using (private.is_family_member(id) or created_by = (select auth.uid()));

create policy "parents update families"
  on public.families for update to authenticated
  using (private.is_family_parent(id))
  with check (private.is_family_parent(id));

create policy "members read profiles"
  on public.profiles for select to authenticated
  using (private.can_read_profile(id));

create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "members read family members"
  on public.family_members for select to authenticated
  using (private.is_family_member(family_id) or profile_id = (select auth.uid()));

create policy "members read family settings"
  on public.family_settings for select to authenticated
  using (private.is_family_member(family_id));
create policy "parents update family settings"
  on public.family_settings for update to authenticated
  using (private.is_family_parent(family_id))
  with check (private.is_family_parent(family_id));

create policy "members read goals"
  on public.learning_goals for select to authenticated
  using (private.is_family_member(family_id));
create policy "parents create goals"
  on public.learning_goals for insert to authenticated
  with check (
    private.is_family_parent(family_id)
    and created_by = (select auth.uid())
    and private.can_read_profile(child_profile_id)
  );
create policy "parents update goals"
  on public.learning_goals for update to authenticated
  using (private.is_family_parent(family_id))
  with check (private.is_family_parent(family_id));
create policy "parents delete goals"
  on public.learning_goals for delete to authenticated
  using (private.is_family_parent(family_id));

create policy "members read sessions"
  on public.learning_sessions for select to authenticated
  using (private.is_family_member(family_id));
create policy "parents create sessions"
  on public.learning_sessions for insert to authenticated
  with check (
    private.is_family_parent(family_id)
    and exists (
      select 1 from public.family_members child_member
      where child_member.family_id = learning_sessions.family_id
        and child_member.profile_id = learning_sessions.child_profile_id
        and child_member.role = 'child'
        and child_member.status = 'active'
    )
  );
create policy "members update sessions"
  on public.learning_sessions for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));

create policy "members read session events"
  on public.session_events for select to authenticated
  using (exists (
    select 1 from public.learning_sessions s
    where s.id = session_id and private.is_family_member(s.family_id)
  ));
create policy "members create session events"
  on public.session_events for insert to authenticated
  with check (exists (
    select 1 from public.learning_sessions s
    where s.id = session_id and private.is_family_member(s.family_id)
  ));

create policy "members read study lock events"
  on public.study_lock_events for select to authenticated
  using (private.is_family_member(family_id));
create policy "members create study lock events"
  on public.study_lock_events for insert to authenticated
  with check (
    private.is_family_member(family_id)
    and triggered_by = (select auth.uid())
  );

create policy "members read approvals"
  on public.approvals for select to authenticated
  using (private.is_family_member(family_id));
create policy "members create approvals"
  on public.approvals for insert to authenticated
  with check (
    private.is_family_member(family_id)
    and requested_by = (select auth.uid())
  );
create policy "parents update approvals"
  on public.approvals for update to authenticated
  using (private.is_family_parent(family_id))
  with check (private.is_family_parent(family_id));

create policy "members read ai plans"
  on public.ai_plans for select to authenticated
  using (private.is_family_member(family_id));
create policy "parents create ai plans"
  on public.ai_plans for insert to authenticated
  with check (private.is_family_parent(family_id));
create policy "parents update ai plans"
  on public.ai_plans for update to authenticated
  using (private.is_family_parent(family_id))
  with check (private.is_family_parent(family_id));

create policy "recipients read notifications"
  on public.notifications for select to authenticated
  using (
    private.is_family_member(family_id)
    and recipient_id = (select auth.uid())
  );
create policy "members create notifications"
  on public.notifications for insert to authenticated
  with check (
    private.is_family_member(family_id)
    and (sender_id is null or sender_id = (select auth.uid()))
  );

create policy "parents read family invites"
  on public.family_invites for select to authenticated
  using (private.is_family_parent(family_id));

create policy "members read schedule"
  on public.schedule_events for select to authenticated
  using (private.is_family_member(family_id));
create policy "parents create schedule"
  on public.schedule_events for insert to authenticated
  with check (private.is_family_parent(family_id));
create policy "parents update schedule"
  on public.schedule_events for update to authenticated
  using (private.is_family_parent(family_id))
  with check (private.is_family_parent(family_id));
create policy "parents delete schedule"
  on public.schedule_events for delete to authenticated
  using (private.is_family_parent(family_id));

create policy "members read exceptions"
  on public.exceptions for select to authenticated
  using (private.is_family_member(family_id));
create policy "parents create exceptions"
  on public.exceptions for insert to authenticated
  with check (private.is_family_parent(family_id));
create policy "parents update exceptions"
  on public.exceptions for update to authenticated
  using (private.is_family_parent(family_id))
  with check (private.is_family_parent(family_id));

create policy "members read session tasks"
  on public.session_tasks for select to authenticated
  using (exists (
    select 1 from public.learning_sessions s
    where s.id = session_id and private.is_family_member(s.family_id)
  ));
create policy "members update session tasks"
  on public.session_tasks for update to authenticated
  using (exists (
    select 1 from public.learning_sessions s
    where s.id = session_id and private.is_family_member(s.family_id)
  ))
  with check (exists (
    select 1 from public.learning_sessions s
    where s.id = session_id and private.is_family_member(s.family_id)
  ));

create policy "members read quick check questions"
  on public.quick_check_questions for select to authenticated
  using (private.is_family_member(family_id));

create policy "members read quick check answers"
  on public.quick_check_answers for select to authenticated
  using (exists (
    select 1 from public.learning_sessions s
    where s.id = session_id and private.is_family_member(s.family_id)
  ));
create policy "members create quick check answers"
  on public.quick_check_answers for insert to authenticated
  with check (
    answered_by = (select auth.uid())
    and exists (
      select 1
      from public.learning_sessions s
      join public.quick_check_questions q on q.id = question_id and q.family_id = s.family_id
      where s.id = session_id and private.is_family_member(s.family_id)
    )
  );
create policy "members update quick check answers"
  on public.quick_check_answers for update to authenticated
  using (answered_by = (select auth.uid()))
  with check (answered_by = (select auth.uid()));

create policy "members read device commands"
  on public.device_commands for select to authenticated
  using (private.is_family_member(family_id));
create policy "members create device commands"
  on public.device_commands for insert to authenticated
  with check (
    private.is_family_member(family_id)
    and requested_by = (select auth.uid())
  );
create policy "parents update device commands"
  on public.device_commands for update to authenticated
  using (private.is_family_parent(family_id))
  with check (private.is_family_parent(family_id));

-- Private evidence bucket. The first path segment is always the family UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'learning-evidence',
  'learning-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "family members read learning evidence" on storage.objects;
create policy "family members read learning evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_family_member(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "family members upload learning evidence" on storage.objects;
create policy "family members upload learning evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_family_member(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "family members update learning evidence" on storage.objects;
create policy "family members update learning evidence"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_family_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_family_member(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "family parents delete learning evidence" on storage.objects;
create policy "family parents delete learning evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_family_parent(((storage.foldername(name))[1])::uuid)
  );

-- Create a family and managed child as one transaction. The implementation is
-- private because it must bridge the period before a user has a membership.
create or replace function private.create_family_with_child(
  p_family_name text,
  p_child_name text
)
returns table (family_id uuid, parent_profile_id uuid, child_profile_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_family_id uuid := gen_random_uuid();
  v_child_id uuid := gen_random_uuid();
  v_user_email text;
  v_user_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(p_family_name)) < 2 or length(trim(p_child_name)) < 2 then
    raise exception 'Family and child names must contain at least 2 characters';
  end if;

  select coalesce(u.email, v_user_id::text || '@users.invalid'),
         coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email, ''), '@', 1), 'Phụ huynh')
  into v_user_email, v_user_name
  from auth.users u
  where u.id = v_user_id;

  insert into public.profiles (id, email, full_name, role)
  values (v_user_id, v_user_email, v_user_name, 'parent')
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();

  insert into public.profiles (id, email, full_name, role)
  values (v_child_id, 'managed-child-' || v_child_id::text || '@local.invalid', trim(p_child_name), 'child');

  insert into public.families (id, name, created_by)
  values (v_family_id, trim(p_family_name), v_user_id);
  insert into public.family_members (family_id, profile_id, role, status)
  values
    (v_family_id, v_user_id, 'parent', 'active'),
    (v_family_id, v_child_id, 'child', 'active');
  insert into public.family_settings (family_id)
  values (v_family_id);

  return query select v_family_id, v_user_id, v_child_id;
end;
$$;

create or replace function public.create_family_with_child(
  p_family_name text,
  p_child_name text
)
returns table (family_id uuid, parent_profile_id uuid, child_profile_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_family_with_child(p_family_name, p_child_name);
$$;

revoke all on function private.create_family_with_child(text, text) from public, anon, authenticated, service_role;
grant execute on function private.create_family_with_child(text, text) to authenticated;
revoke all on function public.create_family_with_child(text, text) from public, anon;
grant execute on function public.create_family_with_child(text, text) to authenticated;

create or replace function private.update_family_profile(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_family_name text,
  p_child_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_family_parent(p_family_id) then
    raise exception 'Parent access required';
  end if;
  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = p_child_profile_id
      and fm.role = 'child'
      and fm.status = 'active'
  ) then
    raise exception 'Child profile is not in this family';
  end if;
  if length(trim(p_family_name)) < 2 or length(trim(p_child_name)) < 2 then
    raise exception 'Family and child names must contain at least 2 characters';
  end if;

  update public.families
  set name = trim(p_family_name)
  where id = p_family_id;
  update public.profiles
  set full_name = trim(p_child_name), updated_at = now()
  where id = p_child_profile_id;
  return true;
end;
$$;

create or replace function public.update_family_profile(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_family_name text,
  p_child_name text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_family_profile(
    p_family_id,
    p_child_profile_id,
    p_family_name,
    p_child_name
  );
$$;

revoke all on function private.update_family_profile(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.update_family_profile(uuid, uuid, text, text) to authenticated;
revoke all on function public.update_family_profile(uuid, uuid, text, text) from public, anon;
grant execute on function public.update_family_profile(uuid, uuid, text, text) to authenticated;

create or replace function private.clear_family_data(p_family_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer := 0;
begin
  if not private.is_family_parent(p_family_id) then
    raise exception 'Parent access required';
  end if;

  delete from public.quick_check_answers answer
  using public.learning_sessions session
  where answer.session_id = session.id and session.family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.session_tasks task
  using public.learning_sessions session
  where task.session_id = session.id and session.family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.session_events event
  using public.learning_sessions session
  where event.session_id = session.id and session.family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.study_lock_events where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.approvals where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.device_commands where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.learning_sessions where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.schedule_events where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.learning_goals where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.exceptions where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.ai_plans where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.notifications where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.quick_check_questions where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  return v_count;
end;
$$;

create or replace function public.clear_family_data(p_family_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.clear_family_data(p_family_id);
$$;

revoke all on function private.clear_family_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.clear_family_data(uuid) to authenticated;
revoke all on function public.clear_family_data(uuid) from public, anon;
grant execute on function public.clear_family_data(uuid) to authenticated;

create or replace function public.start_learning_session(p_session_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_command_id uuid;
  v_study_lock boolean;
begin
  select * into v_session
  from public.learning_sessions
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'Learning session not found';
  end if;
  if v_session.status not in ('scheduled', 'rejected') then
    raise exception 'Session cannot start from status %', v_session.status;
  end if;

  update public.learning_sessions
  set status = 'in_progress',
      actual_started_at = now(),
      ends_at = null,
      updated_at = now()
  where id = p_session_id;

  insert into public.session_events (session_id, event_type)
  values (p_session_id, 'start');

  select coalesce(
    (
      select se.study_lock_enabled
      from public.schedule_events se
      where se.family_id = v_session.family_id
        and se.child_profile_id = v_session.child_profile_id
        and se.event_type in ('self_study', 'learning')
        and se.subject = v_session.subject
        and se.title = v_session.title
        and se.day_of_week = (array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[
          extract(isodow from v_session.starts_at at time zone 'Asia/Ho_Chi_Minh')::integer
        ]
        and se.start_time = (v_session.starts_at at time zone 'Asia/Ho_Chi_Minh')::time
      order by se.sort_order, se.start_time
      limit 1
    ),
    (
      select fs.study_lock_enabled
      from public.family_settings fs
      where fs.family_id = v_session.family_id
    ),
    true
  ) into v_study_lock;

  if v_study_lock then
    insert into public.study_lock_events (
      family_id, child_profile_id, session_id, action, reason, triggered_by
    ) values (
      v_session.family_id, v_session.child_profile_id, p_session_id,
      'locked', 'Buổi học bắt đầu.', (select auth.uid())
    );
    insert into public.device_commands (
      family_id, child_profile_id, session_id, command, policy, requested_by
    ) values (
      v_session.family_id, v_session.child_profile_id, p_session_id,
      'lock', 'study_only', (select auth.uid())
    ) returning id into v_command_id;
  end if;

  return v_command_id;
end;
$$;

create or replace function public.request_session_break(
  p_session_id uuid,
  p_minutes integer default 10
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_event_id uuid;
begin
  if p_minutes < 1 or p_minutes > 30 then
    raise exception 'Break must be between 1 and 30 minutes';
  end if;

  select * into v_session
  from public.learning_sessions
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'Learning session not found';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception 'Break can only be requested during a session';
  end if;

  insert into public.session_events (session_id, event_type, metadata)
  values (p_session_id, 'break_requested', jsonb_build_object('minutes', p_minutes))
  returning id into v_event_id;

  insert into public.notifications (
    family_id, recipient_id, sender_id, type, title, message
  )
  select v_session.family_id, fm.profile_id, (select auth.uid()), 'session',
         'Yêu cầu nghỉ giữa buổi',
         'Trẻ xin nghỉ ' || p_minutes::text || ' phút trong buổi ' || v_session.title || '.'
  from public.family_members fm
  where fm.family_id = v_session.family_id
    and fm.role = 'parent'
    and fm.status = 'active'
  on conflict do nothing;

  return v_event_id;
end;
$$;

create or replace function public.submit_learning_session(
  p_session_id uuid,
  p_reflection text,
  p_duration_minutes integer,
  p_tasks jsonb,
  p_answers jsonb
)
returns table (session_status text, device_command_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_item jsonb;
  v_tasks_done integer;
  v_tasks_total integer;
  v_quick_score integer;
  v_quick_total integer;
  v_status text;
  v_command_id uuid;
begin
  if p_reflection not in ('easy', 'ok', 'hard') then
    raise exception 'Invalid reflection';
  end if;
  if p_duration_minutes < 1 or p_duration_minutes > 1440 then
    raise exception 'Invalid duration';
  end if;
  if jsonb_typeof(coalesce(p_tasks, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Tasks and answers must be arrays';
  end if;

  select * into v_session
  from public.learning_sessions
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'Learning session not found';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception 'Session cannot be submitted from status %', v_session.status;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb))
  loop
    update public.session_tasks
    set is_done = coalesce((v_item->>'is_done')::boolean, false), updated_at = now()
    where id = (v_item->>'id')::uuid
      and session_id = p_session_id;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.quick_check_answers (
      session_id, question_id, selected_option, is_correct, answered_by, answered_at
    )
    select p_session_id,
           q.id,
           (v_item->>'selected_option')::integer,
           q.correct_option = (v_item->>'selected_option')::integer,
           (select auth.uid()),
           now()
    from public.quick_check_questions q
    where q.id = (v_item->>'question_id')::uuid
      and q.family_id = v_session.family_id
      and q.subject = v_session.subject
      and q.active
    on conflict (session_id, question_id) do update
    set selected_option = excluded.selected_option,
        is_correct = excluded.is_correct,
        answered_by = excluded.answered_by,
        answered_at = excluded.answered_at;
  end loop;

  select count(*) filter (where is_done), count(*)
  into v_tasks_done, v_tasks_total
  from public.session_tasks
  where session_id = p_session_id;

  select count(*) filter (where a.is_correct), count(q.id)
  into v_quick_score, v_quick_total
  from public.quick_check_questions q
  left join public.quick_check_answers a
    on a.question_id = q.id and a.session_id = p_session_id
  where q.family_id = v_session.family_id
    and q.subject = v_session.subject
    and q.active;

  v_status := case
    when v_session.approval_policy = 'auto_approve'
      and v_tasks_done = v_tasks_total
      and (v_quick_total = 0 or v_quick_score::numeric / v_quick_total >= 0.8)
      then 'approved'
    when v_session.approval_policy = 'evidence_required'
      and v_session.evidence_url is not null
      and v_tasks_done = v_tasks_total
      then 'approved'
    else 'awaiting_parent'
  end;

  update public.learning_sessions
  set status = v_status,
      ends_at = now(),
      duration_minutes = p_duration_minutes,
      tasks_done = v_tasks_done,
      tasks_total = v_tasks_total,
      reflection = p_reflection,
      quick_check_score = v_quick_score,
      quick_check_total = v_quick_total,
      focus_score = case when v_quick_total = 0 then null
        else round(v_quick_score::numeric / v_quick_total * 100)::integer end,
      notes = case when v_status = 'approved'
        then 'Buổi học đã được tự động duyệt theo chính sách gia đình.'
        else 'Buổi học đã được gửi và đang chờ phụ huynh xác nhận.' end,
      updated_at = now()
  where id = p_session_id;

  insert into public.approvals (
    family_id, session_id, requested_by, approved_by, decision, reason, reviewed_at
  ) values (
    v_session.family_id, p_session_id, (select auth.uid()),
    case when v_status = 'approved' then (select auth.uid()) else null end,
    case when v_status = 'approved' then 'approved' else 'pending' end,
    case when v_status = 'approved'
      then 'Tự động duyệt theo approval policy.'
      else 'Chờ phụ huynh xác nhận để mở Study Lock.' end,
    case when v_status = 'approved' then now() else null end
  )
  on conflict (session_id) do update
  set decision = excluded.decision,
      approved_by = excluded.approved_by,
      reason = excluded.reason,
      reviewed_at = excluded.reviewed_at;

  insert into public.session_events (session_id, event_type, metadata)
  values (
    p_session_id,
    'finish',
    jsonb_build_object(
      'reflection', p_reflection,
      'tasks_done', v_tasks_done,
      'tasks_total', v_tasks_total,
      'quick_check_score', v_quick_score,
      'quick_check_total', v_quick_total,
      'resulting_status', v_status
    )
  );

  if v_status = 'approved' and exists (
    select 1 from public.device_commands dc
    where dc.session_id = p_session_id and dc.command = 'lock'
  ) then
    insert into public.study_lock_events (
      family_id, child_profile_id, session_id, action, reason, triggered_by
    ) values (
      v_session.family_id, v_session.child_profile_id, p_session_id,
      'unlocked', 'Buổi học được tự động duyệt.', (select auth.uid())
    );
    insert into public.device_commands (
      family_id, child_profile_id, session_id, command, requested_by
    ) values (
      v_session.family_id, v_session.child_profile_id, p_session_id,
      'unlock', (select auth.uid())
    ) returning id into v_command_id;
  else
    insert into public.notifications (
      family_id, recipient_id, sender_id, type, title, message
    )
    select v_session.family_id, fm.profile_id, (select auth.uid()), 'approval',
           'Yêu cầu xác nhận buổi học',
           'Buổi ' || v_session.title || ' đã hoàn thành và đang chờ duyệt.'
    from public.family_members fm
    where fm.family_id = v_session.family_id
      and fm.role = 'parent'
      and fm.status = 'active'
    on conflict do nothing;
  end if;

  return query select v_status, v_command_id;
end;
$$;

create or replace function public.approve_learning_session(p_session_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_command_id uuid;
begin
  select * into v_session
  from public.learning_sessions
  where id = p_session_id
  for update;

  if v_session.id is null or not exists (
    select 1
    from public.family_members fm
    where fm.family_id = v_session.family_id
      and fm.profile_id = (select auth.uid())
      and fm.role = 'parent'
      and fm.status = 'active'
  ) then
    raise exception 'Parent access required';
  end if;
  if v_session.status <> 'awaiting_parent' then
    raise exception 'Session is not awaiting approval';
  end if;

  update public.learning_sessions
  set status = 'approved', updated_at = now()
  where id = p_session_id;

  update public.approvals
  set decision = 'approved',
      approved_by = (select auth.uid()),
      reviewed_at = now(),
      reason = 'Phụ huynh đã xác nhận kết quả.'
  where session_id = p_session_id;

  if exists (
    select 1 from public.device_commands dc
    where dc.session_id = p_session_id and dc.command = 'lock'
  ) then
    insert into public.session_events (session_id, event_type)
    values (p_session_id, 'unlock');
    insert into public.study_lock_events (
      family_id, child_profile_id, session_id, action, reason, triggered_by
    ) values (
      v_session.family_id, v_session.child_profile_id, p_session_id,
      'unlocked', 'Phụ huynh xác nhận kết quả.', (select auth.uid())
    );
    insert into public.device_commands (
      family_id, child_profile_id, session_id, command, requested_by
    ) values (
      v_session.family_id, v_session.child_profile_id, p_session_id,
      'unlock', (select auth.uid())
    ) returning id into v_command_id;
  end if;

  return v_command_id;
end;
$$;

create or replace function public.apply_week_plan(
  p_plan_id uuid,
  p_events jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.ai_plans%rowtype;
  v_item jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_events, '[]'::jsonb)) <> 'array' then
    raise exception 'Plan events must be an array';
  end if;

  select * into v_plan
  from public.ai_plans
  where id = p_plan_id
  for update;

  if v_plan.id is null or not exists (
    select 1
    from public.family_members fm
    where fm.family_id = v_plan.family_id
      and fm.profile_id = (select auth.uid())
      and fm.role = 'parent'
      and fm.status = 'active'
  ) then
    raise exception 'Plan not found';
  end if;
  if v_plan.status not in ('generated', 'accepted') then
    raise exception 'Plan cannot be applied from status %', v_plan.status;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
  loop
    if v_item->>'event_type' not in (
      'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other',
      'learning', 'routine'
    )
      or v_item->>'day_of_week' not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
      or nullif(trim(v_item->>'title'), '') is null
      or coalesce((v_item->>'duration_minutes')::integer, 0) < 5 then
      raise exception 'Invalid plan schedule item';
    end if;

    if nullif(v_item->>'id', '') is not null then
      update public.schedule_events
      set day_of_week = coalesce(v_item->>'day_of_week', day_of_week),
          start_time = coalesce((v_item->>'start_time')::time, start_time),
          duration_minutes = coalesce((v_item->>'duration_minutes')::integer, duration_minutes),
          title = coalesce(v_item->>'title', title),
          subject = coalesce(v_item->>'subject', subject),
          event_type = coalesce(v_item->>'event_type', event_type),
          status = coalesce(v_item->>'status', status),
          sort_order = coalesce((v_item->>'sort_order')::integer, sort_order),
          updated_at = now()
      where id = (v_item->>'id')::uuid
        and family_id = v_plan.family_id
        and child_profile_id = v_plan.child_profile_id;
      if not found then raise exception 'Plan schedule item not found'; end if;
      v_count := v_count + 1;
    else
      insert into public.schedule_events (
        family_id, child_profile_id, title, event_type, subject, day_of_week,
        start_time, duration_minutes, status, sort_order
      ) values (
        v_plan.family_id,
        v_plan.child_profile_id,
        v_item->>'title',
        coalesce(v_item->>'event_type', 'learning'),
        v_item->>'subject',
        v_item->>'day_of_week',
        (v_item->>'start_time')::time,
        (v_item->>'duration_minutes')::integer,
        coalesce(v_item->>'status', 'upcoming'),
        coalesce((v_item->>'sort_order')::integer, 0)
      );
      v_count := v_count + 1;
    end if;
  end loop;

  update public.ai_plans
  set status = 'executed'
  where id = p_plan_id;

  return v_count;
end;
$$;

create or replace function public.save_schedule_setup(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_events jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_event_id uuid;
  v_keep_ids uuid[] := array[]::uuid[];
begin
  if jsonb_typeof(coalesce(p_events, '[]'::jsonb)) <> 'array' then
    raise exception 'Schedule events must be an array';
  end if;
  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = (select auth.uid())
      and fm.role = 'parent'
      and fm.status = 'active'
  ) then
    raise exception 'Parent access required';
  end if;
  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = p_child_profile_id
      and fm.role = 'child'
      and fm.status = 'active'
  ) then
    raise exception 'Child profile is not in this family';
  end if;

  perform 1 from public.families where id = p_family_id for update;

  for v_item in select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
  loop
    if v_item->>'event_type' not in (
      'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other',
      'learning', 'routine'
    )
      or v_item->>'day_of_week' not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
      or nullif(trim(v_item->>'title'), '') is null
      or (
        v_item->>'event_type' in ('school', 'extra', 'self_study', 'learning')
        and nullif(trim(v_item->>'subject'), '') is null
      )
      or coalesce((v_item->>'duration_minutes')::integer, 0) < 5 then
      raise exception 'Invalid learning schedule item';
    end if;

    if nullif(v_item->>'id', '') is not null then
      update public.schedule_events
      set title = v_item->>'title',
          event_type = v_item->>'event_type',
          subject = nullif(v_item->>'subject', ''),
          day_of_week = v_item->>'day_of_week',
          start_time = (v_item->>'start_time')::time,
          duration_minutes = (v_item->>'duration_minutes')::integer,
          status = coalesce(v_item->>'status', 'upcoming'),
          sort_order = coalesce((v_item->>'sort_order')::integer, 0),
          study_lock_enabled = coalesce((v_item->>'study_lock_enabled')::boolean, true),
          updated_at = now()
      where id = (v_item->>'id')::uuid
        and family_id = p_family_id
        and child_profile_id = p_child_profile_id
        and event_type in (
          'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other',
          'learning', 'routine'
        )
      returning id into v_event_id;
      if v_event_id is null then raise exception 'Schedule item not found'; end if;
    else
      insert into public.schedule_events (
        family_id, child_profile_id, title, event_type, subject, day_of_week,
        start_time, duration_minutes, status, sort_order, study_lock_enabled
      ) values (
        p_family_id,
        p_child_profile_id,
        v_item->>'title',
        v_item->>'event_type',
        nullif(v_item->>'subject', ''),
        v_item->>'day_of_week',
        (v_item->>'start_time')::time,
        (v_item->>'duration_minutes')::integer,
        coalesce(v_item->>'status', 'upcoming'),
        coalesce((v_item->>'sort_order')::integer, 0),
        coalesce((v_item->>'study_lock_enabled')::boolean, true)
      ) returning id into v_event_id;
    end if;
    v_keep_ids := array_append(v_keep_ids, v_event_id);
    v_event_id := null;
  end loop;

  delete from public.schedule_events
  where family_id = p_family_id
    and child_profile_id = p_child_profile_id
    and event_type in (
      'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other',
      'learning', 'routine'
    )
    and not (id = any(v_keep_ids));

  insert into public.learning_sessions (
    family_id, child_profile_id, goal_id, title, subject, starts_at,
    duration_minutes, status, tasks_total, approval_policy
  )
  select
    se.family_id,
    se.child_profile_id,
    goal.id,
    se.title,
    coalesce(se.subject, se.title),
    (
      (now() at time zone 'Asia/Ho_Chi_Minh')::date
      + occurrence.day_offset
      + se.start_time
    ) at time zone 'Asia/Ho_Chi_Minh',
    se.duration_minutes,
    'scheduled',
    0,
    case when settings.default_approval_mode = 'auto' then 'auto_approve' else 'parent_required' end
  from public.schedule_events se
  cross join lateral (
    select (
      (
        array_position(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], se.day_of_week)
        - extract(isodow from now() at time zone 'Asia/Ho_Chi_Minh')::integer
        + 7
      ) % 7
      + case
          when se.day_of_week = (array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[
            extract(isodow from now() at time zone 'Asia/Ho_Chi_Minh')::integer
          ]
          and se.start_time <= (now() at time zone 'Asia/Ho_Chi_Minh')::time
          then 7 else 0
        end
    )::integer as day_offset
  ) occurrence
  left join lateral (
    select lg.id
    from public.learning_goals lg
    where lg.family_id = se.family_id
      and lg.child_profile_id = se.child_profile_id
      and lg.subject = se.subject
      and lg.status = 'active'
    order by lg.created_at desc
    limit 1
  ) goal on true
  left join public.family_settings settings on settings.family_id = se.family_id
  where se.family_id = p_family_id
    and se.child_profile_id = p_child_profile_id
    and se.event_type in ('self_study', 'learning')
    and not exists (
      select 1
      from public.learning_sessions existing
      where existing.family_id = se.family_id
        and existing.child_profile_id = se.child_profile_id
        and existing.title = se.title
        and existing.starts_at = (
          (
            (now() at time zone 'Asia/Ho_Chi_Minh')::date
            + occurrence.day_offset
            + se.start_time
          ) at time zone 'Asia/Ho_Chi_Minh'
        )
    );

  return jsonb_array_length(coalesce(p_events, '[]'::jsonb));
end;
$$;

revoke all on function public.start_learning_session(uuid) from public, anon;
revoke all on function public.request_session_break(uuid, integer) from public, anon;
revoke all on function public.submit_learning_session(uuid, text, integer, jsonb, jsonb) from public, anon;
revoke all on function public.approve_learning_session(uuid) from public, anon;
revoke all on function public.apply_week_plan(uuid, jsonb) from public, anon;
revoke all on function public.save_schedule_setup(uuid, uuid, jsonb) from public, anon;
grant execute on function public.start_learning_session(uuid) to authenticated;
grant execute on function public.request_session_break(uuid, integer) to authenticated;
grant execute on function public.submit_learning_session(uuid, text, integer, jsonb, jsonb) to authenticated;
grant execute on function public.approve_learning_session(uuid) to authenticated;
grant execute on function public.apply_week_plan(uuid, jsonb) to authenticated;
grant execute on function public.save_schedule_setup(uuid, uuid, jsonb) to authenticated;

-- Browser grants are intentionally limited to data the authenticated UI uses.
revoke all on table
  public.families, public.profiles, public.family_members, public.family_settings,
  public.learning_goals, public.learning_sessions, public.session_events,
  public.study_lock_events, public.approvals, public.ai_plans,
  public.notifications, public.family_invites, public.schedule_events,
  public.exceptions, public.session_tasks, public.quick_check_questions,
  public.quick_check_answers, public.device_commands
from anon, authenticated;

grant select on table
  public.families, public.profiles, public.family_members, public.family_settings,
  public.learning_goals, public.learning_sessions, public.session_events,
  public.study_lock_events, public.approvals, public.ai_plans,
  public.notifications, public.family_invites, public.schedule_events,
  public.exceptions, public.session_tasks,
  public.quick_check_answers, public.device_commands
to authenticated;

grant select (
  id, family_id, subject, prompt, options, active, sort_order, created_at, updated_at
) on public.quick_check_questions to authenticated;

grant update (full_name, avatar_url, updated_at) on public.profiles to authenticated;
grant update (name) on public.families to authenticated;
grant update on public.family_settings to authenticated;
grant insert, update, delete on public.learning_goals to authenticated;
grant insert, update on public.learning_sessions to authenticated;
grant insert on public.session_events, public.study_lock_events, public.notifications to authenticated;
grant insert, update on public.approvals to authenticated;
grant insert, update on public.ai_plans to authenticated;
grant insert, update, delete on public.schedule_events to authenticated;
grant insert, update on public.exceptions to authenticated;
grant update on public.session_tasks to authenticated;
grant insert, update on public.quick_check_answers to authenticated;
grant insert, update on public.device_commands to authenticated;

-- Convert legacy aggregate task counts to rows without inventing subject content.
insert into public.session_tasks (session_id, title, sort_order)
select s.id, 'Bài ' || task_number::text, task_number * 10
from public.learning_sessions s
cross join lateral generate_series(1, s.tasks_total) as task_number
where not exists (
  select 1 from public.session_tasks existing where existing.session_id = s.id
);

update public.session_tasks t
set is_done = t.sort_order <= (s.tasks_done * 10)
from public.learning_sessions s
where s.id = t.session_id and s.tasks_done > 0;

-- Realtime publication remains in public; Supabase manages its realtime schema.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'learning_sessions', 'schedule_events', 'learning_goals', 'exceptions',
    'session_tasks', 'quick_check_answers', 'approvals', 'device_commands', 'ai_plans'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
