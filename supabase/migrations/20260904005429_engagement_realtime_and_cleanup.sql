-- Keep engagement cards current across parent/child devices and make the
-- existing "clear child data" workflow remove child-authored notifications.

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['child_milestones', 'notifications']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

create or replace function public.reset_child_engagement(p_child_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
begin
  select member.family_id into v_family_id
  from public.family_members member
  where member.profile_id = p_child_profile_id
    and member.role = 'child'
    and member.status = 'active'
    and private.is_family_parent(member.family_id)
  limit 1;
  if v_family_id is null then
    raise exception 'Parent access required';
  end if;

  delete from public.notifications
  where family_id = v_family_id and sender_id = p_child_profile_id;
  delete from public.child_milestones
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  update public.profiles
  set experience_points = 0, updated_at = now()
  where id = p_child_profile_id;
  return found;
end;
$$;

revoke all on function public.reset_child_engagement(uuid) from public, anon, authenticated;
grant execute on function public.reset_child_engagement(uuid) to authenticated;

notify pgrst, 'reload schema';
