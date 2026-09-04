-- Schedule setup materializes the next occurrence for extra/self-study events.
drop policy if exists "parents create sessions" on public.learning_sessions;
create policy "parents create sessions"
  on public.learning_sessions for insert to authenticated
  with check (
    private.is_family_parent(family_id)
    and exists (
      select 1 from public.family_members child_member
      where child_member.family_id = learning_sessions.family_id
        and child_member.profile_id = learning_sessions.child_profile_id
        and child_member.role = 'child'
        and child_member.status = 'active'
    )
  );

grant insert on public.learning_sessions to authenticated;
