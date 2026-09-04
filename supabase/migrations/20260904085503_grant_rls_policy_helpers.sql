-- RLS expressions run as the querying role and therefore need EXECUTE on the
-- exact private helpers they invoke. Keep the private schema and these helpers
-- unavailable to anonymous callers.

revoke all on function private.is_family_parent(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.is_parent_account_session()
  from public, anon, authenticated, service_role;

grant execute on function private.is_family_parent(uuid) to authenticated;
grant execute on function private.is_parent_account_session() to authenticated;

notify pgrst, 'reload schema';
