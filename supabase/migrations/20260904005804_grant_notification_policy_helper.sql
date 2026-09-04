-- RLS evaluates its predicate with the caller's privileges. This predicate is
-- safe to expose to authenticated callers: it returns only whether their own
-- auth session is currently in parent mode and has a locked search_path.
revoke all on function private.is_parent_account_session() from public, anon;
grant execute on function private.is_parent_account_session() to authenticated;

notify pgrst, 'reload schema';
