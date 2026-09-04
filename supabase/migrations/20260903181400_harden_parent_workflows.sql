-- Phase 1 security boundary.
--
-- The browser keeps read-only table access. Every write goes through an audited
-- RPC so callers cannot skip validation or mutate workflow state directly.

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
    from public.family_members member
    where member.family_id = p_family_id
      and member.profile_id = (select auth.uid())
      and member.status = 'active'
      and (
        member.role = 'parent'
        or (member.role = 'child' and member.profile_id = p_child_profile_id)
      )
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
    select 1
    from public.family_members member
    where member.family_id = p_family_id
      and member.profile_id = (select auth.uid())
      and member.status = 'active'
      and (
        member.role = 'parent'
        or (member.role = 'child' and member.profile_id = p_child_profile_id)
      )
  );
$$;

create or replace function private.can_access_session_evidence(
  p_family_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.learning_sessions session
    where session.id = p_session_id
      and session.family_id = p_family_id
      and private.can_access_child(session.family_id, session.child_profile_id)
  );
$$;

revoke all on function private.can_access_child(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_run_child_workflow(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_access_session_evidence(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.can_access_child(uuid, uuid) to authenticated;
grant execute on function private.can_access_session_evidence(uuid, uuid) to authenticated;

-- Restrict child-owned data to the parent or the matching child identity. A
-- guardian/tutor can still read the account membership but not a child's study
-- history unless a later product requirement explicitly grants that access.
drop policy if exists "members read goals" on public.learning_goals;
create policy "parents and child read goals"
  on public.learning_goals for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "members read sessions" on public.learning_sessions;
create policy "parents and child read sessions"
  on public.learning_sessions for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "members read schedule" on public.schedule_events;
create policy "parents and child read schedule"
  on public.schedule_events for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "members read exceptions" on public.exceptions;
create policy "parents and child read exceptions"
  on public.exceptions for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "members read ai plans" on public.ai_plans;
create policy "parents and child read ai plans"
  on public.ai_plans for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "members read study lock events" on public.study_lock_events;
create policy "parents and child read study lock events"
  on public.study_lock_events for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "members read device commands" on public.device_commands;
create policy "parents and child read device commands"
  on public.device_commands for select to authenticated
  using ((select private.can_access_child(family_id, child_profile_id)));

drop policy if exists "members read session events" on public.session_events;
create policy "parents and child read session events"
  on public.session_events for select to authenticated
  using (exists (
    select 1
    from public.learning_sessions session
    where session.id = session_id
      and (select private.can_access_child(session.family_id, session.child_profile_id))
  ));

drop policy if exists "members read session tasks" on public.session_tasks;
create policy "parents and child read session tasks"
  on public.session_tasks for select to authenticated
  using (exists (
    select 1
    from public.learning_sessions session
    where session.id = session_id
      and (select private.can_access_child(session.family_id, session.child_profile_id))
  ));

drop policy if exists "members read quick check answers" on public.quick_check_answers;
create policy "parents and child read quick check answers"
  on public.quick_check_answers for select to authenticated
  using (exists (
    select 1
    from public.learning_sessions session
    where session.id = session_id
      and (select private.can_access_child(session.family_id, session.child_profile_id))
  ));

drop policy if exists "members read approvals" on public.approvals;
create policy "parents and child read approvals"
  on public.approvals for select to authenticated
  using (exists (
    select 1
    from public.learning_sessions session
    where session.id = session_id
      and (select private.can_access_child(session.family_id, session.child_profile_id))
  ));

-- Evidence paths are family/session/file. Do not let a guardian, tutor or a
-- different child read or upload evidence merely because they know a family ID.
drop policy if exists "family members read learning evidence" on storage.objects;
drop policy if exists "parents and child read learning evidence" on storage.objects;
create policy "parents and child read learning evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.can_access_session_evidence(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

drop policy if exists "family members upload learning evidence" on storage.objects;
drop policy if exists "parents and child upload learning evidence" on storage.objects;
create policy "parents and child upload learning evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.can_access_session_evidence(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

drop policy if exists "family members update learning evidence" on storage.objects;

-- Keep the original implementations intact, but move them out of the exposed
-- schema. Public wrappers below perform authorization before executing them.
alter function public.start_learning_session(uuid) set schema private;
alter function private.start_learning_session(uuid) rename to start_learning_session_impl;
alter function private.start_learning_session_impl(uuid) security definer;

alter function public.request_session_break(uuid, integer) set schema private;
alter function private.request_session_break(uuid, integer) rename to request_session_break_impl;
alter function private.request_session_break_impl(uuid, integer) security definer;

alter function public.submit_learning_session(uuid, text, integer, jsonb, jsonb) set schema private;
alter function private.submit_learning_session(uuid, text, integer, jsonb, jsonb) rename to submit_learning_session_impl;
alter function private.submit_learning_session_impl(uuid, text, integer, jsonb, jsonb) security definer;

alter function public.approve_learning_session(uuid) set schema private;
alter function private.approve_learning_session(uuid) rename to approve_learning_session_impl;
alter function private.approve_learning_session_impl(uuid) security definer;

alter function public.apply_week_plan(uuid, jsonb) set schema private;
alter function private.apply_week_plan(uuid, jsonb) rename to apply_week_plan_impl;
alter function private.apply_week_plan_impl(uuid, jsonb) security definer;

alter function public.save_schedule_setup(uuid, uuid, jsonb) set schema private;
alter function private.save_schedule_setup(uuid, uuid, jsonb) rename to save_schedule_setup_impl;
alter function private.save_schedule_setup_impl(uuid, uuid, jsonb) security definer;

revoke all on function private.start_learning_session_impl(uuid) from public, anon, authenticated, service_role;
revoke all on function private.request_session_break_impl(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function private.submit_learning_session_impl(uuid, text, integer, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.approve_learning_session_impl(uuid) from public, anon, authenticated, service_role;
revoke all on function private.apply_week_plan_impl(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.save_schedule_setup_impl(uuid, uuid, jsonb) from public, anon, authenticated, service_role;

create function public.start_learning_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
begin
  select * into v_session from public.learning_sessions where id = p_session_id;
  if v_session.id is null
     or not private.can_run_child_workflow(v_session.family_id, v_session.child_profile_id) then
    raise exception 'Child workflow access required';
  end if;
  return private.start_learning_session_impl(p_session_id);
end;
$$;

create function public.request_session_break(p_session_id uuid, p_minutes integer default 10)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
begin
  select * into v_session from public.learning_sessions where id = p_session_id;
  if v_session.id is null
     or not private.can_run_child_workflow(v_session.family_id, v_session.child_profile_id) then
    raise exception 'Child workflow access required';
  end if;
  return private.request_session_break_impl(p_session_id, p_minutes);
end;
$$;

create function public.submit_learning_session(
  p_session_id uuid,
  p_reflection text,
  p_duration_minutes integer,
  p_tasks jsonb,
  p_answers jsonb
)
returns table (session_status text, device_command_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions%rowtype;
begin
  select * into v_session from public.learning_sessions where id = p_session_id;
  if v_session.id is null
     or not private.can_run_child_workflow(v_session.family_id, v_session.child_profile_id) then
    raise exception 'Child workflow access required';
  end if;
  return query
  select * from private.submit_learning_session_impl(
    p_session_id, p_reflection, p_duration_minutes, p_tasks, p_answers
  );
end;
$$;

create function public.approve_learning_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id from public.learning_sessions where id = p_session_id;
  if v_family_id is null or not private.is_family_parent(v_family_id) then
    raise exception 'Parent access required';
  end if;
  return private.approve_learning_session_impl(p_session_id);
end;
$$;

create function public.apply_week_plan(p_plan_id uuid, p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id from public.ai_plans where id = p_plan_id;
  if v_family_id is null or not private.is_family_parent(v_family_id) then
    raise exception 'Parent access required';
  end if;
  return private.apply_week_plan_impl(p_plan_id, p_events);
end;
$$;

create function public.save_schedule_setup(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
  return private.save_schedule_setup_impl(p_family_id, p_child_profile_id, p_events);
end;
$$;

create function public.create_learning_goal(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_subject text,
  p_target_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_goal_id uuid;
  v_subject text := trim(p_subject);
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
  if length(v_subject) < 1 or length(v_subject) > 100 then
    raise exception 'Subject must contain between 1 and 100 characters';
  end if;
  if p_target_minutes < 5 or p_target_minutes > 10080 then
    raise exception 'Target minutes must be between 5 and 10080';
  end if;

  insert into public.learning_goals (
    family_id, child_profile_id, created_by, title, subject, description,
    target_minutes, status
  ) values (
    p_family_id, p_child_profile_id, (select auth.uid()),
    v_subject || ' tự học', v_subject,
    'Mục tiêu ' || p_target_minutes::text || ' phút mỗi tuần.',
    p_target_minutes, 'active'
  ) returning id into v_goal_id;
  return v_goal_id;
end;
$$;

create function public.create_child_exception(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_title text,
  p_description text,
  p_recommended_action text,
  p_severity text default 'low'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exception_id uuid;
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
  if nullif(trim(p_title), '') is null
     or nullif(trim(p_description), '') is null
     or nullif(trim(p_recommended_action), '') is null then
    raise exception 'Exception content is required';
  end if;
  if p_severity not in ('low', 'mid', 'high') then
    raise exception 'Invalid exception severity';
  end if;

  insert into public.exceptions (
    family_id, child_profile_id, title, description, severity, status,
    recommended_action
  ) values (
    p_family_id, p_child_profile_id, trim(p_title), trim(p_description),
    p_severity, 'open', trim(p_recommended_action)
  ) returning id into v_exception_id;
  return v_exception_id;
end;
$$;

create function public.attach_session_evidence(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_session_id uuid,
  p_evidence_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_run_child_workflow(p_family_id, p_child_profile_id) then
    raise exception 'Child workflow access required';
  end if;
  if p_evidence_path not like p_family_id::text || '/' || p_session_id::text || '/%' then
    raise exception 'Invalid evidence path';
  end if;

  update public.learning_sessions
  set evidence_url = p_evidence_path, updated_at = now()
  where id = p_session_id
    and family_id = p_family_id
    and child_profile_id = p_child_profile_id
    and status in ('in_progress', 'awaiting_parent');
  if not found then
    raise exception 'Learning session is not eligible for evidence';
  end if;
  return true;
end;
$$;

create function public.create_generated_ai_plan(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_model_name text,
  p_plan_type text,
  p_input_summary text,
  p_output_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
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
  if nullif(trim(p_model_name), '') is null
     or nullif(trim(p_plan_type), '') is null
     or jsonb_typeof(p_output_json) <> 'object' then
    raise exception 'Invalid generated plan';
  end if;

  insert into public.ai_plans (
    family_id, child_profile_id, model_name, plan_type, input_summary,
    output_json, status
  ) values (
    p_family_id, p_child_profile_id, trim(p_model_name), trim(p_plan_type),
    nullif(trim(p_input_summary), ''), p_output_json, 'generated'
  ) returning id into v_plan_id;
  return v_plan_id;
end;
$$;

create function public.update_device_command_delivery(
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
declare
  v_family_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role access required';
  end if;
  select family_id into v_family_id from public.device_commands where id = p_command_id;
  if v_family_id is null then raise exception 'Device command not found'; end if;
  if p_status not in ('sent', 'acknowledged', 'failed', 'configuration_required') then
    raise exception 'Invalid command delivery status';
  end if;

  update public.device_commands
  set status = p_status,
      external_id = nullif(trim(p_external_id), ''),
      error_message = nullif(trim(p_error_message), ''),
      processed_at = now()
  where id = p_command_id
    and status in ('queued', 'sent');
  return found;
end;
$$;

-- Existing public account RPCs call private implementations. Execute them as
-- their owner so the private functions no longer need to be granted to clients.
alter function public.add_child_profile(text) security definer;
alter function public.add_child_profile_with_grade(text, smallint) security definer;
alter function public.update_child_profile(uuid, text) security definer;
alter function public.update_child_profile_details(uuid, text, smallint) security definer;
alter function public.clear_child_data(uuid) security definer;
alter function public.get_subject_suggestions(uuid) security definer;

revoke all on function private.add_child_profile(text) from public, anon, authenticated, service_role;
revoke all on function private.add_child_profile_with_grade(text, smallint) from public, anon, authenticated, service_role;
revoke all on function private.update_child_profile(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.update_child_profile_details(uuid, text, smallint) from public, anon, authenticated, service_role;
revoke all on function private.clear_child_data(uuid) from public, anon, authenticated, service_role;
revoke all on function private.get_subject_suggestions(uuid) from public, anon, authenticated, service_role;

-- Policies describe allowed reads. Writes are available only through RPCs.
drop policy if exists "parents update families" on public.families;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "parents update family settings" on public.family_settings;
drop policy if exists "parents create goals" on public.learning_goals;
drop policy if exists "parents update goals" on public.learning_goals;
drop policy if exists "parents delete goals" on public.learning_goals;
drop policy if exists "parents create sessions" on public.learning_sessions;
drop policy if exists "members update sessions" on public.learning_sessions;
drop policy if exists "members create session events" on public.session_events;
drop policy if exists "members create study lock events" on public.study_lock_events;
drop policy if exists "members create approvals" on public.approvals;
drop policy if exists "parents update approvals" on public.approvals;
drop policy if exists "parents create ai plans" on public.ai_plans;
drop policy if exists "parents update ai plans" on public.ai_plans;
drop policy if exists "members create notifications" on public.notifications;
drop policy if exists "parents create schedule" on public.schedule_events;
drop policy if exists "parents update schedule" on public.schedule_events;
drop policy if exists "parents delete schedule" on public.schedule_events;
drop policy if exists "parents create exceptions" on public.exceptions;
drop policy if exists "parents update exceptions" on public.exceptions;
drop policy if exists "members update session tasks" on public.session_tasks;
drop policy if exists "members create quick check answers" on public.quick_check_answers;
drop policy if exists "members update quick check answers" on public.quick_check_answers;
drop policy if exists "members create device commands" on public.device_commands;
drop policy if exists "parents update device commands" on public.device_commands;

revoke insert, update, delete on table
  public.families, public.profiles, public.family_members, public.family_settings,
  public.learning_goals, public.learning_sessions, public.session_events,
  public.study_lock_events, public.approvals, public.ai_plans,
  public.notifications, public.family_invites, public.schedule_events,
  public.exceptions, public.session_tasks, public.quick_check_questions,
  public.quick_check_answers, public.device_commands
from anon, authenticated;

revoke all on function
  public.start_learning_session(uuid),
  public.request_session_break(uuid, integer),
  public.submit_learning_session(uuid, text, integer, jsonb, jsonb),
  public.approve_learning_session(uuid),
  public.apply_week_plan(uuid, jsonb),
  public.save_schedule_setup(uuid, uuid, jsonb),
  public.create_learning_goal(uuid, uuid, text, integer),
  public.create_child_exception(uuid, uuid, text, text, text, text),
  public.attach_session_evidence(uuid, uuid, uuid, text),
  public.create_generated_ai_plan(uuid, uuid, text, text, text, jsonb),
  public.update_device_command_delivery(uuid, text, text, text)
from public, anon, authenticated;

grant execute on function
  public.start_learning_session(uuid),
  public.request_session_break(uuid, integer),
  public.submit_learning_session(uuid, text, integer, jsonb, jsonb),
  public.approve_learning_session(uuid),
  public.apply_week_plan(uuid, jsonb),
  public.save_schedule_setup(uuid, uuid, jsonb),
  public.create_learning_goal(uuid, uuid, text, integer),
  public.create_child_exception(uuid, uuid, text, text, text, text),
  public.attach_session_evidence(uuid, uuid, uuid, text),
  public.create_generated_ai_plan(uuid, uuid, text, text, text, jsonb)
to authenticated;

grant execute on function
  public.update_device_command_delivery(uuid, text, text, text)
to service_role;

notify pgrst, 'reload schema';
