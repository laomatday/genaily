-- Study Lock and learning-session details only belong to self-study activities.
update public.schedule_events
set study_lock_enabled = false,
    updated_at = now()
where event_type not in ('self_study', 'learning')
  and study_lock_enabled;

create or replace function private.enforce_schedule_event_study_lock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.event_type not in ('self_study', 'learning') then
    new.study_lock_enabled := false;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_schedule_event_study_lock() from public, anon, authenticated;

drop trigger if exists enforce_schedule_event_study_lock on public.schedule_events;
create trigger enforce_schedule_event_study_lock
before insert or update of event_type, study_lock_enabled on public.schedule_events
for each row execute function private.enforce_schedule_event_study_lock();
