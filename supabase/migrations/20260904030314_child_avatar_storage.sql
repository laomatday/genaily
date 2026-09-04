-- Private child avatars. The first two path segments are the owning account
-- space and child profile UUIDs; clients always upload a new immutable object.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'child-avatars',
  'child-avatars',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "parents and selected child read child avatars" on storage.objects;
create policy "parents and selected child read child avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'child-avatars'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (select private.can_access_child(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    ))
  );

drop policy if exists "parents upload child avatars" on storage.objects;
create policy "parents upload child avatars"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'child-avatars'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    and (select private.is_parent_account_session())
    and (select private.can_access_child(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    ))
  );

drop policy if exists "parents delete child avatars" on storage.objects;
create policy "parents delete child avatars"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'child-avatars'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (select private.is_parent_account_session())
    and (select private.can_access_child(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    ))
  );

create or replace function public.update_child_avatar(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_avatar_path text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_path text;
  v_expected_prefix text := p_family_id::text || '/' || p_child_profile_id::text || '/';
begin
  if not private.is_family_parent(p_family_id) then
    raise exception 'Parent access required';
  end if;

  if not exists (
    select 1
    from public.family_members member
    where member.family_id = p_family_id
      and member.profile_id = p_child_profile_id
      and member.role = 'child'
      and member.status = 'active'
  ) then
    raise exception 'Child profile is not owned by this account';
  end if;

  if p_avatar_path is not null then
    if p_avatar_path not like v_expected_prefix || '%'
       or p_avatar_path !~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
       or not exists (
         select 1
         from storage.objects object
         where object.bucket_id = 'child-avatars'
           and object.name = p_avatar_path
           and object.owner_id = (select auth.uid()::text)
       ) then
      raise exception 'Invalid child avatar path';
    end if;
  end if;

  select profile.avatar_url
  into v_previous_path
  from public.profiles profile
  where profile.id = p_child_profile_id
  for update;

  update public.profiles
  set avatar_url = p_avatar_path,
      updated_at = now()
  where id = p_child_profile_id;

  if not found then
    raise exception 'Child profile not found';
  end if;

  return v_previous_path;
end;
$$;

revoke all on function public.update_child_avatar(uuid, uuid, text)
  from public, anon;
grant execute on function public.update_child_avatar(uuid, uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
