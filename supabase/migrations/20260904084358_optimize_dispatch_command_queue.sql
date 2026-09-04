-- Applied migration version: 20260904084358.
-- Select command retries only after filtering exhausted work. This prevents an
-- old failed prefix from permanently hiding newer device commands.
create or replace function public.prepare_due_device_command_batch(
  p_limit integer default 25
)
returns table (
  id uuid,
  family_id uuid,
  child_profile_id uuid,
  session_id uuid,
  command text,
  policy text,
  status text,
  external_id text,
  idempotency_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role access required';
  end if;

  update public.device_commands device_command
  set status = 'failed',
      next_attempt_at = 'infinity'::timestamptz,
      error_message = coalesce(
        device_command.error_message,
        'Command retry limit reached'
      )
  where device_command.attempt_count >= device_command.max_attempts
    and device_command.status in (
      'queued', 'processing', 'failed', 'configuration_required'
    )
    and device_command.next_attempt_at <> 'infinity'::timestamptz;

  return query
  select device_command.id,
         device_command.family_id,
         device_command.child_profile_id,
         device_command.session_id,
         device_command.command,
         device_command.policy,
         device_command.status,
         device_command.external_id,
         device_command.idempotency_key
  from public.device_commands device_command
  where device_command.attempt_count < device_command.max_attempts
    and (
      (
        device_command.status in ('queued', 'failed', 'configuration_required')
        and device_command.next_attempt_at <= now()
      )
      or (
        device_command.status = 'processing'
        and device_command.last_attempt_at < now() - interval '2 minutes'
      )
    )
  order by device_command.next_attempt_at, device_command.created_at,
           device_command.id
  limit v_limit;
end;
$$;

revoke all on function public.prepare_due_device_command_batch(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_due_device_command_batch(integer)
  to service_role;

notify pgrst, 'reload schema';
