-- Child engagement features used by the parent/child dashboards. Values are
-- persisted and awarded transactionally; the UI never invents XP or rewards.

alter table public.profiles
  add column if not exists experience_points integer not null default 0;

alter table public.learning_sessions
  add column if not exists awarded_points integer not null default 0,
  add column if not exists child_note text;

alter table public.family_settings
  add column if not exists xp_per_minute integer not null default 1,
  add column if not exists xp_per_completed_task integer not null default 10,
  add column if not exists xp_per_correct_answer integer not null default 5,
  add column if not exists xp_level_size integer not null default 1000,
  add column if not exists break_duration_minutes integer not null default 5,
  add column if not exists max_breaks_per_session integer not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_experience_points_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_experience_points_check
      check (experience_points >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_sessions_awarded_points_check'
      and conrelid = 'public.learning_sessions'::regclass
  ) then
    alter table public.learning_sessions add constraint learning_sessions_awarded_points_check
      check (awarded_points >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'learning_sessions_child_note_length_check'
      and conrelid = 'public.learning_sessions'::regclass
  ) then
    alter table public.learning_sessions add constraint learning_sessions_child_note_length_check
      check (child_note is null or length(child_note) <= 1000);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'family_settings_engagement_values_check'
      and conrelid = 'public.family_settings'::regclass
  ) then
    alter table public.family_settings add constraint family_settings_engagement_values_check
      check (
        xp_per_minute between 0 and 100
        and xp_per_completed_task between 0 and 1000
        and xp_per_correct_answer between 0 and 1000
        and xp_level_size between 100 and 100000
        and break_duration_minutes between 1 and 30
        and max_breaks_per_session between 0 and 10
      );
  end if;
end $$;

create table if not exists public.child_milestones (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (length(trim(title)) between 2 and 120),
  description text check (description is null or length(description) <= 500),
  target_points integer not null check (target_points between 1 and 1000000),
  starting_points integer not null default 0 check (starting_points >= 0),
  status text not null default 'active'
    check (status in ('active', 'unlocked', 'redeemed', 'archived')),
  unlocked_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.child_milestones enable row level security;

create index if not exists child_milestones_family_child_idx
  on public.child_milestones (family_id, child_profile_id, created_at desc);
create index if not exists child_milestones_created_by_idx
  on public.child_milestones (created_by);
create unique index if not exists child_milestones_one_open_per_child_idx
  on public.child_milestones (family_id, child_profile_id)
  where status in ('active', 'unlocked');

revoke all on table public.child_milestones from public, anon, authenticated;
grant select on table public.child_milestones to authenticated;

drop policy if exists "parents and child read milestones" on public.child_milestones;
create policy "parents and child read milestones"
  on public.child_milestones for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "recipients read notifications" on public.notifications;
create policy "parent session reads notifications"
  on public.notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and (select private.is_parent_account_session())
  );

create or replace function private.award_session_experience()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.family_settings%rowtype;
  v_points integer;
  v_total integer;
begin
  if new.status not in ('approved', 'completed')
     or old.status in ('approved', 'completed')
     or new.awarded_points > 0 then
    return new;
  end if;

  select * into v_settings
  from public.family_settings
  where family_id = new.family_id;

  v_points := greatest(coalesce(new.duration_minutes, 0), 0)
      * coalesce(v_settings.xp_per_minute, 1)
    + greatest(coalesce(new.tasks_done, 0), 0)
      * coalesce(v_settings.xp_per_completed_task, 10)
    + greatest(coalesce(new.quick_check_score, 0), 0)
      * coalesce(v_settings.xp_per_correct_answer, 5);

  update public.learning_sessions
  set awarded_points = v_points
  where id = new.id and awarded_points = 0;

  if found and v_points > 0 then
    update public.profiles
    set experience_points = experience_points + v_points,
        updated_at = now()
    where id = new.child_profile_id
    returning experience_points into v_total;

    update public.child_milestones
    set status = 'unlocked', unlocked_at = now(), updated_at = now()
    where family_id = new.family_id
      and child_profile_id = new.child_profile_id
      and status = 'active'
      and v_total - starting_points >= target_points;
  end if;
  return new;
end;
$$;

revoke all on function private.award_session_experience()
  from public, anon, authenticated, service_role;

drop trigger if exists learning_sessions_award_experience on public.learning_sessions;
create trigger learning_sessions_award_experience
after update of status on public.learning_sessions
for each row execute function private.award_session_experience();

create or replace function public.save_session_note(
  p_session_id uuid,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
begin
  select * into v_session
  from public.learning_sessions
  where id = p_session_id;
  if v_session.id is null
     or not private.can_run_child_workflow(v_session.family_id, v_session.child_profile_id) then
    raise exception 'Child workflow access required';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception 'Notes can only be saved during an active session';
  end if;
  if length(coalesce(p_note, '')) > 1000 then
    raise exception 'Note is too long';
  end if;

  update public.learning_sessions
  set child_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
  where id = p_session_id;
  return found;
end;
$$;

create or replace function public.send_parent_message(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_message text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.can_run_child_workflow(p_family_id, p_child_profile_id) then
    raise exception 'Child workflow access required';
  end if;
  if length(trim(coalesce(p_message, ''))) not between 1 and 500 then
    raise exception 'Message must contain between 1 and 500 characters';
  end if;

  insert into public.notifications (
    family_id, recipient_id, sender_id, type, title, message
  )
  select p_family_id, member.profile_id, p_child_profile_id,
         'child_message', 'Tin nhắn từ bé', trim(p_message)
  from public.family_members member
  where member.family_id = p_family_id
    and member.role = 'parent'
    and member.status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_parent_account_session() then
    raise exception 'Parent access required';
  end if;
  update public.notifications
  set is_read = true
  where id = p_notification_id
    and recipient_id = (select auth.uid());
  return found;
end;
$$;

create or replace function public.save_child_milestone(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_title text,
  p_description text,
  p_target_points integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_starting_points integer;
  v_current_points integer;
begin
  if not private.is_family_parent(p_family_id) then
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
  if length(trim(coalesce(p_title, ''))) not between 2 and 120
     or length(coalesce(p_description, '')) > 500
     or p_target_points not between 1 and 1000000 then
    raise exception 'Invalid milestone';
  end if;

  select id, starting_points into v_id, v_starting_points
  from public.child_milestones
  where family_id = p_family_id
    and child_profile_id = p_child_profile_id
    and status in ('active', 'unlocked')
  order by created_at desc
  limit 1
  for update;

  select experience_points into v_current_points
  from public.profiles
  where id = p_child_profile_id;

  if v_id is null then
    insert into public.child_milestones (
      family_id, child_profile_id, created_by, title, description,
      target_points, starting_points, status, unlocked_at
    ) values (
      p_family_id, p_child_profile_id, (select auth.uid()), trim(p_title),
      nullif(trim(coalesce(p_description, '')), ''), p_target_points,
      v_current_points, 'active', null
    ) returning id into v_id;
  else
    update public.child_milestones
    set title = trim(p_title),
        description = nullif(trim(coalesce(p_description, '')), ''),
        target_points = p_target_points,
        status = case
          when v_current_points - v_starting_points >= p_target_points then 'unlocked'
          else 'active'
        end,
        unlocked_at = case
          when v_current_points - v_starting_points >= p_target_points
            then coalesce(unlocked_at, now())
          else null
        end,
        updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.redeem_child_milestone(p_milestone_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_milestone public.child_milestones%rowtype;
begin
  select * into v_milestone
  from public.child_milestones
  where id = p_milestone_id
  for update;
  if v_milestone.id is null
     or not private.can_run_child_workflow(v_milestone.family_id, v_milestone.child_profile_id) then
    raise exception 'Child workflow access required';
  end if;
  if v_milestone.status <> 'unlocked' then
    raise exception 'Milestone has not been unlocked';
  end if;

  update public.child_milestones
  set status = 'redeemed', redeemed_at = now(), updated_at = now()
  where id = p_milestone_id;
  return found;
end;
$$;

create or replace function public.reset_child_engagement(p_child_profile_id uuid)
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
    and private.is_family_parent(member.family_id)
  limit 1;
  if v_family_id is null then
    raise exception 'Parent access required';
  end if;

  delete from public.child_milestones
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  update public.profiles
  set experience_points = 0, updated_at = now()
  where id = p_child_profile_id;
  return found;
end;
$$;

create or replace function public.request_session_break(
  p_session_id uuid,
  p_minutes integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
  v_break_count integer;
  v_break_limit integer;
begin
  select * into v_session
  from public.learning_sessions
  where id = p_session_id;
  if v_session.id is null
     or not private.can_run_child_workflow(v_session.family_id, v_session.child_profile_id) then
    raise exception 'Child workflow access required';
  end if;

  select count(*) into v_break_count
  from public.session_events
  where session_id = p_session_id and event_type = 'break_requested';
  select max_breaks_per_session into v_break_limit
  from public.family_settings
  where family_id = v_session.family_id;
  if v_break_count >= coalesce(v_break_limit, 2) then
    raise exception 'Break limit reached';
  end if;
  return private.request_session_break_impl(p_session_id, p_minutes);
end;
$$;

revoke all on function public.save_session_note(uuid, text) from public, anon, authenticated;
revoke all on function public.send_parent_message(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.save_child_milestone(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.redeem_child_milestone(uuid) from public, anon, authenticated;
revoke all on function public.reset_child_engagement(uuid) from public, anon, authenticated;
revoke all on function public.request_session_break(uuid, integer) from public, anon, authenticated;

grant execute on function public.save_session_note(uuid, text) to authenticated;
grant execute on function public.send_parent_message(uuid, uuid, text) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.save_child_milestone(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.redeem_child_milestone(uuid) to authenticated;
grant execute on function public.reset_child_engagement(uuid) to authenticated;
grant execute on function public.request_session_break(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
