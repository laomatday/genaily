-- Applied migration version: 20260904084247.
-- Concurrency, fail-closed authorization and background-work guards found
-- while validating the application for 200 simultaneous accounts.

-- A child-mode marker is authoritative for the lifetime of its Auth session.
-- `expires_at` remains only as legacy/audit metadata; it must never make a
-- still-authenticated child device become a parent without re-authentication.
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
  );
$$;

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
      )
      or exists (
        select 1
        from private.app_device_modes device_mode
        where device_mode.auth_session_id = private.current_auth_session_id()
          and device_mode.user_id = (select auth.uid())
          and device_mode.family_id = p_family_id
          and device_mode.child_profile_id = p_child_profile_id
          and device_mode.mode = 'child'
      )
    )
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
    from public.family_members target_member
    where target_member.profile_id = p_profile_id
      and target_member.status = 'active'
      and (
        private.can_access_child(target_member.family_id, target_member.profile_id)
        or (
          private.is_parent_account_session()
          and exists (
            select 1
            from public.family_members parent_member
            where parent_member.family_id = target_member.family_id
              and parent_member.profile_id = (select auth.uid())
              and parent_member.role = 'parent'
              and parent_member.status = 'active'
          )
        )
      )
  );
$$;

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
  if v_user_id is null then raise exception 'Authentication required'; end if;

  return query
  select 'child'::text, device_mode.family_id, device_mode.child_profile_id
  from private.app_device_modes device_mode
  where device_mode.auth_session_id = v_session_id
    and device_mode.user_id = v_user_id
    and device_mode.mode = 'child'
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
    v_session_id, v_user_id, p_family_id, p_child_profile_id,
    now() + interval '30 days'
  ) on conflict (auth_session_id) do update
    set expires_at = excluded.expires_at;
  return true;
end;
$$;

revoke all on function private.is_parent_account_session()
  from public, anon, authenticated, service_role;
revoke all on function private.can_run_child_workflow(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_access_child(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_read_profile(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.can_access_child(uuid, uuid) to authenticated;
grant execute on function private.can_read_profile(uuid) to authenticated;
revoke all on function public.get_app_mode() from public, anon;
revoke all on function public.enter_child_mode(uuid, uuid) from public, anon;
grant execute on function public.get_app_mode() to authenticated;
grant execute on function public.enter_child_mode(uuid, uuid) to authenticated;

drop policy if exists "members read family members" on public.family_members;
create policy "members read family members"
  on public.family_members for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      role = 'child'
      and (select private.can_access_child(family_id, profile_id))
    )
    or (
      (select private.is_parent_account_session())
      and (select private.is_family_member(family_id))
    )
  );

-- Serialize the quota check with the session row. Two simultaneous break
-- requests can no longer both observe the same pre-insert count.
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
  where id = p_session_id
  for update;
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

revoke all on function public.request_session_break(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.request_session_break(uuid, integer) to authenticated;

-- Heartbeats are still accepted every poll, but only publish a last_seen
-- update at a bounded cadence.
create or replace function public.touch_managed_device_heartbeat(
  p_device_id uuid,
  p_min_interval_seconds integer default 60
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
  if p_min_interval_seconds not between 10 and 600 then
    raise exception 'Invalid heartbeat write interval';
  end if;
  update public.managed_devices device
  set last_seen_at = now()
  where device.id = p_device_id
    and device.status = 'active'
    and (
      device.last_seen_at is null
      or device.last_seen_at <= now() - make_interval(secs => p_min_interval_seconds)
    );
  return found;
end;
$$;

revoke all on function public.touch_managed_device_heartbeat(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.touch_managed_device_heartbeat(uuid, integer) to service_role;

-- Claim due deliveries in one transaction. Filtering happens before LIMIT so
-- exhausted historical rows cannot starve newer commands.
create or replace function public.claim_device_deliveries(
  p_device_id uuid,
  p_limit integer default 20,
  p_redelivery_seconds integer default 30
)
returns table (
  delivery_id uuid,
  id uuid,
  command text,
  policy text,
  session_id uuid,
  created_at timestamptz,
  idempotency_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_redelivery integer := least(greatest(coalesce(p_redelivery_seconds, 30), 10), 600);
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role access required';
  end if;

  update public.device_command_deliveries delivery
  set status = 'expired',
      error_message = coalesce(delivery.error_message, 'Delivery retry limit reached')
  where delivery.device_id = p_device_id
    and delivery.status in ('queued', 'failed', 'delivered')
    and delivery.attempt_count >= delivery.max_attempts;

  return query
  with due as materialized (
    select delivery.id
    from public.device_command_deliveries delivery
    where delivery.device_id = p_device_id
      and delivery.attempt_count < delivery.max_attempts
      and (
        (
          delivery.status in ('queued', 'failed')
          and delivery.next_attempt_at <= v_now
        )
        or (
          delivery.status = 'delivered'
          and delivery.delivered_at <= v_now - make_interval(secs => v_redelivery)
        )
      )
    order by delivery.created_at, delivery.id
    for update of delivery skip locked
    limit v_limit
  ), claimed as materialized (
    update public.device_command_deliveries delivery
    set status = 'delivered',
        delivered_at = v_now,
        attempt_count = delivery.attempt_count + 1,
        next_attempt_at = v_now + make_interval(secs => v_redelivery),
        error_message = null
    from due
    where delivery.id = due.id
    returning delivery.id, delivery.command_id, delivery.created_at
  ), command_update as (
    update public.device_commands device_command
    set status = 'sent',
        external_id = 'companion:' || p_device_id::text,
        processed_at = v_now,
        error_message = null
    where device_command.id in (select claimed.command_id from claimed)
      and device_command.status in (
        'queued', 'processing', 'failed', 'configuration_required'
      )
    returning device_command.id
  )
  select claimed.id,
         device_command.id,
         device_command.command,
         device_command.policy,
         device_command.session_id,
         device_command.created_at,
         device_command.idempotency_key
  from claimed
  join public.device_commands device_command
    on device_command.id = claimed.command_id
  left join command_update updated_command
    on updated_command.id = device_command.id
  order by claimed.created_at, claimed.id;
end;
$$;

revoke all on function public.claim_device_deliveries(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_device_deliveries(uuid, integer, integer)
  to service_role;

create or replace function private.current_schedule_version(
  p_family_id uuid,
  p_child_profile_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(
    event.id::text || ':' || extract(epoch from event.updated_at)::text,
    ',' order by event.id
  ), ''))
  from public.schedule_events event
  where event.family_id = p_family_id
    and event.child_profile_id = p_child_profile_id;
$$;

revoke all on function private.current_schedule_version(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Replace/delete is validated after omitted rows have been removed. The whole
-- function is transactional, so a later overlap error still restores them.
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

  perform pg_advisory_xact_lock(
    hashtextextended(p_family_id::text || ':' || p_child_profile_id::text, 0)
  );

  for v_item in
    select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb))
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
          < (date '2000-01-01' + second_event.start_time
             + make_interval(mins => second_event.duration_minutes))
      and (date '2000-01-01' + second_event.start_time)
          < (date '2000-01-01' + first_event.start_time
             + make_interval(mins => first_event.duration_minutes))
  ) then
    raise exception 'Schedule items overlap';
  end if;

  perform private.materialize_schedule_window(
    p_family_id,
    p_child_profile_id,
    null,
    42
  );

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

create or replace function public.save_schedule_setup_v2(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_events jsonb,
  p_expected_version text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_version text;
begin
  if not private.is_family_parent(p_family_id) then
    raise exception 'Parent access required';
  end if;
  if not exists (
    select 1
    from public.family_members member
    where member.family_id = p_family_id
      and member.profile_id = p_child_profile_id
      and member.role = 'child'
      and member.status = 'active'
  ) then
    raise exception 'Child profile is not in this account';
  end if;
  if p_expected_version is null or p_expected_version !~ '^[0-9a-f]{32}$' then
    raise exception 'Invalid schedule version';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_family_id::text || ':' || p_child_profile_id::text, 0)
  );
  v_current_version := private.current_schedule_version(
    p_family_id,
    p_child_profile_id
  );
  if v_current_version <> p_expected_version then
    raise exception 'SCHEDULE_VERSION_CONFLICT';
  end if;

  return private.save_schedule_setup_impl(
    p_family_id,
    p_child_profile_id,
    p_events
  );
end;
$$;

revoke all on function public.save_schedule_setup_v2(uuid, uuid, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_schedule_setup_v2(uuid, uuid, jsonb, text)
  to authenticated;

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
  v_lock_key bigint := hashtextextended(
    p_family_id::text || ':' || p_child_profile_id::text,
    0
  );
begin
  if p_days < 1 or p_days > 90 then
    raise exception 'Materialization window must be between 1 and 90 days';
  end if;
  select coalesce(nullif(settings.timezone, ''), 'Asia/Ho_Chi_Minh')
  into v_timezone
  from public.family_settings settings
  where settings.family_id = p_family_id;
  v_timezone := coalesce(v_timezone, 'Asia/Ho_Chi_Minh');
  v_from_date := coalesce(p_from_date, (now() at time zone v_timezone)::date);

  -- Session-level advisory lock is released before the next child in the cron
  -- loop, while still conflicting with save_schedule_setup's transaction lock.
  perform pg_advisory_lock(v_lock_key);
  begin
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
    on conflict (schedule_event_id, occurrence_date)
      where schedule_event_id is not null
    do update set
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      title = excluded.title,
      subject = excluded.subject,
      event_type = excluded.event_type,
      study_lock_enabled = excluded.study_lock_enabled,
      status = case
        when schedule_occurrences.status in ('in_progress', 'completed')
          then schedule_occurrences.status
        else 'scheduled'
      end,
      updated_at = now()
    where row(
      schedule_occurrences.starts_at,
      schedule_occurrences.ends_at,
      schedule_occurrences.title,
      schedule_occurrences.subject,
      schedule_occurrences.event_type,
      schedule_occurrences.study_lock_enabled,
      schedule_occurrences.status
    ) is distinct from row(
      excluded.starts_at,
      excluded.ends_at,
      excluded.title,
      excluded.subject,
      excluded.event_type,
      excluded.study_lock_enabled,
      case
        when schedule_occurrences.status in ('in_progress', 'completed')
          then schedule_occurrences.status
        else 'scheduled'
      end
    );
    get diagnostics v_count = row_count;

    insert into public.learning_sessions (
      family_id, child_profile_id, goal_id, schedule_event_id,
      schedule_occurrence_id, title, subject, starts_at, duration_minutes,
      status, tasks_total, approval_policy
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
      greatest(
        1,
        round(extract(epoch from occurrence.ends_at - occurrence.starts_at) / 60)::integer
      ),
      'scheduled',
      0,
      case
        when settings.default_approval_mode = 'auto' then 'auto_approve'
        else 'parent_required'
      end
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
    left join public.family_settings settings
      on settings.family_id = occurrence.family_id
    where occurrence.family_id = p_family_id
      and occurrence.child_profile_id = p_child_profile_id
      and occurrence.occurrence_date between v_from_date and v_from_date + p_days - 1
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
    where learning_sessions.status = 'scheduled'
      and row(
        learning_sessions.schedule_event_id,
        learning_sessions.title,
        learning_sessions.subject,
        learning_sessions.starts_at,
        learning_sessions.duration_minutes,
        learning_sessions.goal_id,
        learning_sessions.approval_policy
      ) is distinct from row(
        excluded.schedule_event_id,
        excluded.title,
        excluded.subject,
        excluded.starts_at,
        excluded.duration_minutes,
        excluded.goal_id,
        excluded.approval_policy
      );
  exception when others then
    perform pg_advisory_unlock(v_lock_key);
    raise;
  end;
  perform pg_advisory_unlock(v_lock_key);
  return v_count;
end;
$$;

revoke all on function private.materialize_schedule_window(uuid, uuid, date, integer)
  from public, anon, authenticated, service_role;

-- Repair the tail of the rolling horizon instead of rewriting all 42 days.
-- Seven days preserves recovery headroom if the daily cron is briefly paused.
create or replace function private.materialize_all_schedule_windows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_child record;
  v_count integer := 0;
  v_local_today date;
begin
  for v_child in
    select distinct
      event.family_id,
      event.child_profile_id,
      coalesce(nullif(settings.timezone, ''), 'Asia/Ho_Chi_Minh') as timezone
    from public.schedule_events event
    left join public.family_settings settings on settings.family_id = event.family_id
    order by event.family_id, event.child_profile_id
  loop
    v_local_today := (now() at time zone v_child.timezone)::date;
    v_count := v_count + private.materialize_schedule_window(
      v_child.family_id,
      v_child.child_profile_id,
      v_local_today + 35,
      7
    );
  end loop;
  return v_count;
end;
$$;

revoke all on function private.materialize_all_schedule_windows()
  from public, anon, authenticated, service_role;

-- Move the default Vietnam maintenance slot from 09:15 to 01:15 local time.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job
    where jobname = 'genai-family-materialize-occurrences'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
  perform cron.schedule(
    'genai-family-materialize-occurrences',
    '15 18 * * *',
    'select private.materialize_all_schedule_windows();'
  );
end $$;

notify pgrst, 'reload schema';
