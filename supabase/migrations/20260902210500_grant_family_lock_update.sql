-- save_schedule_setup locks the family row to serialize concurrent schedule
-- writes. RLS still restricts UPDATE to active parent members of that family.
grant update (name) on public.families to authenticated;

-- The existing families table predates updated_at. Keep the profile RPC
-- compatible with that deployed schema.
create or replace function private.update_family_profile(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_family_name text,
  p_child_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_family_parent(p_family_id) then
    raise exception 'Parent access required';
  end if;
  if not exists (
    select 1
    from public.family_members fm
    where fm.family_id = p_family_id
      and fm.profile_id = p_child_profile_id
      and fm.role = 'child'
      and fm.status = 'active'
  ) then
    raise exception 'Child profile is not in this family';
  end if;
  if length(trim(p_family_name)) < 2 or length(trim(p_child_name)) < 2 then
    raise exception 'Family and child names must contain at least 2 characters';
  end if;

  update public.families set name = trim(p_family_name) where id = p_family_id;
  update public.profiles
  set full_name = trim(p_child_name), updated_at = now()
  where id = p_child_profile_id;
  return true;
end;
$$;
