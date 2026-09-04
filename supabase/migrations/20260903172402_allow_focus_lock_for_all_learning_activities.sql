-- Focus Lock is configurable for every learning activity. Session details remain
-- exclusive to self-study, but school and extra classes can also lock distractions.

create or replace function private.enforce_schedule_event_study_lock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.event_type not in ('school', 'extra', 'self_study', 'learning') then
    new.study_lock_enabled := false;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_schedule_event_study_lock()
  from public, anon, authenticated;

drop trigger if exists enforce_schedule_event_study_lock on public.schedule_events;
create trigger enforce_schedule_event_study_lock
before insert or update of event_type, study_lock_enabled on public.schedule_events
for each row execute function private.enforce_schedule_event_study_lock();

alter table public.schedule_events
  drop constraint if exists schedule_events_study_lock_activity_check;
alter table public.schedule_events
  add constraint schedule_events_study_lock_activity_check
  check (
    not study_lock_enabled
    or event_type in ('school', 'extra', 'self_study', 'learning')
  );
