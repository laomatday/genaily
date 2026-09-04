-- Cover foreign-key columns used during profile/device cleanup.

create index if not exists managed_devices_created_by_idx
  on public.managed_devices (created_by);

create index if not exists device_command_deliveries_child_profile_idx
  on public.device_command_deliveries (child_profile_id);
