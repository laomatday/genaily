-- Every client-side schedule save must present the version returned by the
-- latest dashboard snapshot. Keeping the legacy function installed supports
-- migration history and trusted maintenance, but it is no longer an exposed
-- authenticated API that can silently overwrite a newer editor.

revoke execute on function public.save_schedule_setup(uuid, uuid, jsonb)
  from authenticated;

comment on function public.save_schedule_setup(uuid, uuid, jsonb) is
  'Legacy internal wrapper. Client execution is revoked; use save_schedule_setup_v2 with a snapshot version.';

notify pgrst, 'reload schema';
