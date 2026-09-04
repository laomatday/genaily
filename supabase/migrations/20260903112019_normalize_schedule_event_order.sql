-- Keep persisted order aligned with the actual time slot for every child/day.
with ranked_events as (
  select
    event.id,
    row_number() over (
      partition by event.family_id, event.child_profile_id, event.day_of_week
      order by event.start_time, event.sort_order, event.id
    ) * 10 as chronological_order
  from public.schedule_events event
)
update public.schedule_events event
set sort_order = ranked.chronological_order,
    updated_at = now()
from ranked_events ranked
where event.id = ranked.id
  and event.sort_order is distinct from ranked.chronological_order;

create index if not exists schedule_events_child_day_time_idx
  on public.schedule_events (
    family_id,
    child_profile_id,
    day_of_week,
    start_time,
    sort_order
  );
