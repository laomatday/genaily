-- Applied migration version: 20260904084139.
-- Collapse the parent/child dashboard's fan-out into one RLS-protected,
-- transactionally consistent snapshot.  The function remains SECURITY
-- INVOKER so every underlying SELECT continues to be filtered by the caller's
-- existing RLS policies.

create index if not exists child_milestones_child_profile_idx
  on public.child_milestones (child_profile_id);

create index if not exists schedule_occurrences_dashboard_idx
  on public.schedule_occurrences (
    family_id,
    child_profile_id,
    occurrence_date,
    starts_at
  );

create index if not exists exceptions_dashboard_idx
  on public.exceptions (family_id, child_profile_id, created_at desc);

create index if not exists ai_plans_dashboard_idx
  on public.ai_plans (family_id, child_profile_id, created_at desc);

create index if not exists quick_check_questions_active_sort_idx
  on public.quick_check_questions (family_id, sort_order)
  where active = true;

create index if not exists device_commands_dashboard_idx
  on public.device_commands (family_id, child_profile_id, created_at desc);

create index if not exists notifications_dashboard_idx
  on public.notifications (family_id, recipient_id, created_at desc);

create index if not exists device_command_deliveries_poll_idx
  on public.device_command_deliveries (device_id, created_at)
  where status in ('queued', 'failed', 'delivered');

-- Expose only an authorization decision, never the underlying private mode
-- rows. The snapshot uses this boundary so child mode cannot request a sibling.
create or replace function public.can_access_child_context(
  p_family_id uuid,
  p_child_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.can_access_child(p_family_id, p_child_profile_id);
$$;

-- The source table contains correct_option and therefore remains unavailable
-- to authenticated clients. Return only the fields required to render a quiz.
create or replace function public.get_quick_check_questions(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  family_id uuid,
  subject text,
  prompt text,
  options jsonb,
  active boolean,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select question.id, question.family_id, question.subject, question.prompt,
         question.options, question.active, question.sort_order,
         question.created_at, question.updated_at
  from public.quick_check_questions question
  where question.family_id = p_family_id
    and question.active = true
    and private.can_access_child(p_family_id, p_child_profile_id)
  order by question.sort_order, question.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.can_access_child_context(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_quick_check_questions(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.can_access_child_context(uuid, uuid) to authenticated;
grant execute on function public.get_quick_check_questions(uuid, uuid, integer) to authenticated;

create or replace function public.get_child_dashboard_snapshot(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_session_end timestamptz,
  p_occurrence_start date,
  p_occurrence_end date,
  p_session_limit integer default 21,
  p_occurrence_limit integer default 800,
  p_exception_limit integer default 20,
  p_device_command_limit integer default 12,
  p_device_delivery_limit integer default 60,
  p_milestone_limit integer default 12,
  p_notification_limit integer default 30
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_limit integer := least(greatest(coalesce(p_session_limit, 21), 1), 101);
  v_occurrence_limit integer := least(greatest(coalesce(p_occurrence_limit, 800), 1), 2000);
  v_exception_limit integer := least(greatest(coalesce(p_exception_limit, 20), 1), 100);
  v_device_command_limit integer := least(greatest(coalesce(p_device_command_limit, 12), 1), 100);
  v_device_delivery_limit integer := least(greatest(coalesce(p_device_delivery_limit, 60), 1), 200);
  v_milestone_limit integer := least(greatest(coalesce(p_milestone_limit, 12), 1), 100);
  v_notification_limit integer := least(greatest(coalesce(p_notification_limit, 30), 1), 100);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_session_end is null
    or p_occurrence_start is null
    or p_occurrence_end is null
    or p_occurrence_end < p_occurrence_start
    or p_occurrence_end > p_occurrence_start + 62 then
    raise exception 'Invalid dashboard window';
  end if;

  if not public.can_access_child_context(p_family_id, p_child_profile_id) then
    raise exception 'Child profile is not accessible to this account';
  end if;

  return (
    with recent_session_page as materialized (
      select session.*
      from public.learning_sessions session
      where session.family_id = p_family_id
        and session.child_profile_id = p_child_profile_id
        and session.starts_at <= p_session_end
      order by session.starts_at desc, session.id desc
      limit v_session_limit
    ), session_page as materialized (
      select recent.* from recent_session_page recent
      union
      select active.*
      from public.learning_sessions active
      where active.family_id = p_family_id
        and active.child_profile_id = p_child_profile_id
        and active.status in ('in_progress', 'awaiting_parent')
    )
    select jsonb_build_object(
      'family_members', coalesce((
        select jsonb_agg(to_jsonb(member_row))
        from (
          select member.profile_id, member.role, member.status
          from public.family_members member
          where member.family_id = p_family_id
            and member.profile_id in (v_user_id, p_child_profile_id)
        ) member_row
      ), '[]'::jsonb),
      'profiles', coalesce((
        select jsonb_agg(to_jsonb(profile_row))
        from (
          select profile.id, profile.full_name, profile.avatar_url, profile.role,
                 profile.grade_level, profile.experience_points
          from public.profiles profile
          where profile.id in (v_user_id, p_child_profile_id)
        ) profile_row
      ), '[]'::jsonb),
      'learning_goals', coalesce((
        select jsonb_agg(to_jsonb(goal_row) order by goal_row.created_at)
        from (
          select goal.*
          from public.learning_goals goal
          where goal.family_id = p_family_id
            and goal.child_profile_id = p_child_profile_id
          order by goal.created_at
          limit 50
        ) goal_row
      ), '[]'::jsonb),
      'learning_sessions', coalesce((
        select jsonb_agg(to_jsonb(session_row) order by session_row.starts_at desc, session_row.id desc)
        from session_page session_row
      ), '[]'::jsonb),
      'schedule_events', coalesce((
        select jsonb_agg(
          to_jsonb(event_row)
          order by event_row.day_of_week, event_row.start_time, event_row.sort_order
        )
        from (
          select event.*
          from public.schedule_events event
          where event.family_id = p_family_id
            and event.child_profile_id = p_child_profile_id
          order by event.day_of_week, event.start_time, event.sort_order
          limit 100
        ) event_row
      ), '[]'::jsonb),
      'schedule_version', (
        select md5(coalesce(string_agg(
          event.id::text || ':' || extract(epoch from event.updated_at)::text,
          ',' order by event.id
        ), ''))
        from public.schedule_events event
        where event.family_id = p_family_id
          and event.child_profile_id = p_child_profile_id
      ),
      'schedule_occurrences', coalesce((
        select jsonb_agg(to_jsonb(occurrence_row) order by occurrence_row.starts_at)
        from (
          select occurrence.*
          from public.schedule_occurrences occurrence
          where occurrence.family_id = p_family_id
            and occurrence.child_profile_id = p_child_profile_id
            and occurrence.occurrence_date >= p_occurrence_start
            and occurrence.occurrence_date <= p_occurrence_end
          order by occurrence.starts_at
          limit v_occurrence_limit
        ) occurrence_row
      ), '[]'::jsonb),
      'exceptions', coalesce((
        select jsonb_agg(to_jsonb(exception_row) order by exception_row.created_at desc)
        from (
          select exception.*
          from public.exceptions exception
          where exception.family_id = p_family_id
            and exception.child_profile_id = p_child_profile_id
          order by exception.created_at desc
          limit v_exception_limit
        ) exception_row
      ), '[]'::jsonb),
      'family_settings', (
        select to_jsonb(settings_row)
        from public.family_settings settings_row
        where settings_row.family_id = p_family_id
        limit 1
      ),
      'ai_plan', (
        select to_jsonb(plan_row)
        from public.ai_plans plan_row
        where plan_row.family_id = p_family_id
          and plan_row.child_profile_id = p_child_profile_id
        order by plan_row.created_at desc
        limit 1
      ),
      'quick_check_questions', coalesce((
        select jsonb_agg(to_jsonb(question_row) order by question_row.sort_order)
        from public.get_quick_check_questions(
          p_family_id,
          p_child_profile_id,
          50
        ) question_row
      ), '[]'::jsonb),
      'device_commands', coalesce((
        select jsonb_agg(to_jsonb(command_row) order by command_row.created_at desc)
        from (
          select command.*
          from public.device_commands command
          where command.family_id = p_family_id
            and command.child_profile_id = p_child_profile_id
          order by command.created_at desc
          limit v_device_command_limit
        ) command_row
      ), '[]'::jsonb),
      'managed_devices', coalesce((
        select jsonb_agg(to_jsonb(device_row) order by device_row.created_at desc)
        from (
          select device.*
          from public.managed_devices device
          where device.family_id = p_family_id
            and device.child_profile_id = p_child_profile_id
          order by device.created_at desc
          limit 20
        ) device_row
      ), '[]'::jsonb),
      'device_command_deliveries', coalesce((
        select jsonb_agg(to_jsonb(delivery_row) order by delivery_row.created_at desc)
        from (
          select delivery.*
          from public.device_command_deliveries delivery
          where delivery.family_id = p_family_id
            and delivery.child_profile_id = p_child_profile_id
          order by delivery.created_at desc
          limit v_device_delivery_limit
        ) delivery_row
      ), '[]'::jsonb),
      'child_milestones', coalesce((
        select jsonb_agg(to_jsonb(milestone_row) order by milestone_row.created_at desc)
        from (
          select milestone.*
          from public.child_milestones milestone
          where milestone.family_id = p_family_id
            and milestone.child_profile_id = p_child_profile_id
          order by milestone.created_at desc
          limit v_milestone_limit
        ) milestone_row
      ), '[]'::jsonb),
      'notifications', coalesce((
        select jsonb_agg(to_jsonb(notification_row) order by notification_row.created_at desc)
        from (
          select notification.*
          from public.notifications notification
          where notification.family_id = p_family_id
            and notification.recipient_id = v_user_id
          order by notification.created_at desc
          limit v_notification_limit
        ) notification_row
      ), '[]'::jsonb),
      'session_tasks', coalesce((
        select jsonb_agg(to_jsonb(task_row) order by task_row.sort_order)
        from public.session_tasks task_row
        where task_row.session_id in (select session.id from session_page session)
      ), '[]'::jsonb),
      'quick_check_answers', coalesce((
        select jsonb_agg(to_jsonb(answer_row))
        from public.quick_check_answers answer_row
        where answer_row.session_id in (select session.id from session_page session)
      ), '[]'::jsonb),
      'session_events', coalesce((
        select jsonb_agg(to_jsonb(session_event_row) order by session_event_row.event_time)
        from public.session_events session_event_row
        where session_event_row.session_id in (select session.id from session_page session)
      ), '[]'::jsonb),
      'subject_suggestions', coalesce((
        select jsonb_agg(to_jsonb(suggestion_row) order by suggestion_row.sort_order)
        from public.get_subject_suggestions(p_child_profile_id) suggestion_row
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.get_child_dashboard_snapshot(
  uuid,
  uuid,
  timestamptz,
  date,
  date,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) from public, anon;

grant execute on function public.get_child_dashboard_snapshot(
  uuid,
  uuid,
  timestamptz,
  date,
  date,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) to authenticated;
