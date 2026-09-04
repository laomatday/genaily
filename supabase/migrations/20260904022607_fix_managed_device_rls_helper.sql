-- RLS expressions must only call helpers executable by the querying role.
-- Combine the already-exposed parent-session and child-scope helpers instead
-- of granting the broader private.is_family_parent helper.

drop policy if exists "parents read managed devices" on public.managed_devices;
create policy "parents read managed devices"
  on public.managed_devices for select to authenticated
  using (
    (select private.is_parent_account_session())
    and (select private.can_access_child(family_id, child_profile_id))
  );

drop policy if exists "parents read device deliveries" on public.device_command_deliveries;
create policy "parents read device deliveries"
  on public.device_command_deliveries for select to authenticated
  using (
    (select private.is_parent_account_session())
    and (select private.can_access_child(family_id, child_profile_id))
  );

notify pgrst, 'reload schema';
