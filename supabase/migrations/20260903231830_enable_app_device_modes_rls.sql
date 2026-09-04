-- Device mode is server-owned session state. Browser roles must never access it
-- directly; audited SECURITY DEFINER RPCs remain the only access path.
alter table private.app_device_modes enable row level security;

revoke all on table private.app_device_modes from public, anon, authenticated;

drop policy if exists app_device_modes_no_direct_access
  on private.app_device_modes;

create policy app_device_modes_no_direct_access
  on private.app_device_modes
  for all
  to anon, authenticated
  using (false)
  with check (false);
