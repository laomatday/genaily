-- storage.objects protects direct SQL deletion. The client removes known
-- evidence paths through the Storage API before clearing relational data.
drop policy if exists "family parents delete learning evidence" on storage.objects;
create policy "family parents delete learning evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'learning-evidence'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_family_parent(((storage.foldername(name))[1])::uuid)
  );

create or replace function private.clear_family_data(p_family_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer := 0;
begin
  if not private.is_family_parent(p_family_id) then
    raise exception 'Parent access required';
  end if;

  delete from public.quick_check_answers answer
  using public.learning_sessions session
  where answer.session_id = session.id and session.family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.session_tasks task
  using public.learning_sessions session
  where task.session_id = session.id and session.family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.session_events event
  using public.learning_sessions session
  where event.session_id = session.id and session.family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.study_lock_events where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.approvals where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.device_commands where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.learning_sessions where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.schedule_events where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.learning_goals where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.exceptions where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.ai_plans where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.notifications where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  delete from public.quick_check_questions where family_id = p_family_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  return v_count;
end;
$$;
