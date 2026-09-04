-- Every DELETE policy on storage.objects may participate in policy evaluation,
-- even when its bucket predicate is false. Keep the learning-evidence policy on
-- helpers that authenticated clients are explicitly allowed to execute.
drop policy if exists "family parents delete learning evidence" on storage.objects;
create policy "family parents delete learning evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (select private.is_parent_account_session())
    and (select private.can_access_session_evidence(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    ))
  );
