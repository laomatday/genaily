-- Use a single weekly activity stream. Only self-study activities materialize
-- learning_sessions; school, extra classes, rest and daily activities remain
-- schedule entries.
alter table public.schedule_events
  drop constraint if exists schedule_events_event_type_check;
alter table public.schedule_events
  add constraint schedule_events_event_type_check
  check (event_type in (
    'school', 'extra', 'self_study', 'rest', 'sleep', 'sport', 'play', 'other',
    'learning', 'routine'
  ));

create or replace function public.save_schedule_setup(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_events jsonb
)
returns integer
language plpgsql
security invoker
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
      raise exception 'Invalid schedule item';
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
          study_lock_enabled = coalesce((v_item->>'study_lock_enabled')::boolean, false),
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
        coalesce((v_item->>'study_lock_enabled')::boolean, false)
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

revoke all on function public.save_schedule_setup(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_schedule_setup(uuid, uuid, jsonb) to authenticated;
