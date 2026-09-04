-- Older versions materialized school/extra activities as learning sessions.
-- Remove only untouched scheduled rows that are still attributable to a
-- non-self-study schedule item and have no self-study source.
delete from public.learning_sessions session
where session.status = 'scheduled'
  and session.evidence_url is null
  and exists (
    select 1
    from public.schedule_events event
    where event.family_id = session.family_id
      and event.child_profile_id = session.child_profile_id
      and event.event_type not in ('self_study', 'learning')
      and event.subject is not distinct from session.subject
      and event.title = session.title
  )
  and not exists (
    select 1
    from public.schedule_events event
    where event.family_id = session.family_id
      and event.child_profile_id = session.child_profile_id
      and event.event_type in ('self_study', 'learning')
      and event.subject is not distinct from session.subject
      and event.title = session.title
  )
  and not exists (select 1 from public.session_tasks task where task.session_id = session.id)
  and not exists (select 1 from public.quick_check_answers answer where answer.session_id = session.id)
  and not exists (select 1 from public.approvals approval where approval.session_id = session.id)
  and not exists (select 1 from public.device_commands command where command.session_id = session.id)
  and not exists (select 1 from public.study_lock_events event where event.session_id = session.id);
