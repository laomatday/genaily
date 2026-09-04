-- Add indexes and lock down the shared trigger helper. Browser access remains
-- closed until the authenticated workflow migration grants it explicitly.

drop policy if exists "family invites are private" on public.family_invites;

alter function public.set_updated_at() set search_path = '';

create index if not exists schedule_events_child_profile_idx
  on public.schedule_events (child_profile_id);
create index if not exists exceptions_child_profile_idx
  on public.exceptions (child_profile_id);
