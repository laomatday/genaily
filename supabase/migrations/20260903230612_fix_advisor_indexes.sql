-- Keep the unique constraint-owned index and remove the equivalent manual one.
drop index if exists public.quick_check_answers_session_question_key;

-- PostgreSQL does not automatically index the referencing side of foreign keys.
-- These indexes keep joins and cascading parent deletes bounded as data grows.
create index if not exists app_device_modes_child_profile_idx
  on private.app_device_modes (child_profile_id);

create index if not exists app_device_modes_family_idx
  on private.app_device_modes (family_id);

create index if not exists ai_plans_family_idx
  on public.ai_plans (family_id);

create index if not exists ai_plans_session_idx
  on public.ai_plans (session_id);

create index if not exists ai_usage_windows_profile_idx
  on public.ai_usage_windows (profile_id);

create index if not exists learning_goals_child_profile_idx
  on public.learning_goals (child_profile_id);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id);

create index if not exists study_lock_events_family_idx
  on public.study_lock_events (family_id);

create index if not exists study_lock_events_session_idx
  on public.study_lock_events (session_id);
