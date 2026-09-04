-- Repair the shared Auth bootstrap without changing its CRM workspace behavior.
-- profiles.email and profiles.role are NOT NULL, so both must be supplied in the
-- same transaction that creates auth.users.
create schema if not exists private;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_role text;
  v_workspace_is_empty boolean;
begin
  v_role := case
    when new.raw_user_meta_data->>'role' in ('parent', 'child', 'admin')
      then new.raw_user_meta_data->>'role'
    else 'parent'
  end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@users.invalid'),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Người dùng'
    ),
    v_role
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      role = coalesce(public.profiles.role, excluded.role),
      updated_at = now();

  -- Preserve the existing CRM bootstrap exactly: only the first workspace member
  -- is assigned automatically, and duplicate membership remains harmless.
  if to_regclass('public.workspace_members') is not null
    and to_regclass('public.workspaces') is not null then
    execute 'select not exists (select 1 from public.workspace_members)'
      into v_workspace_is_empty;

    if v_workspace_is_empty then
      execute 'select id from public.workspaces order by created_at, id limit 1'
        into v_workspace;

      if v_workspace is not null then
        execute $sql$
          insert into public.workspace_members (workspace_id, user_id, role, status)
          values ($1, $2, 'SM', 'ACTIVE')
          on conflict (workspace_id, user_id) do nothing
        $sql$ using v_workspace, new.id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop function if exists public.handle_new_user();
revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;

-- Backfill accounts created while the old trigger was incomplete.
insert into public.profiles (id, email, full_name, role)
select
  auth_user.id,
  coalesce(auth_user.email, auth_user.id::text || '@users.invalid'),
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
    'Người dùng'
  ),
  case
    when auth_user.raw_user_meta_data->>'role' in ('parent', 'child', 'admin')
      then auth_user.raw_user_meta_data->>'role'
    else 'parent'
  end
from auth.users auth_user
on conflict (id) do nothing;
