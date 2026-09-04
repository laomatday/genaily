-- Product model: one authenticated account owns one internal data space and can
-- manage many child profiles. The legacy families table remains as the tenant
-- boundary so existing foreign keys and historical data stay intact, but it is
-- no longer a user-selectable entity.

create unique index if not exists families_created_by_unique_idx
  on public.families (created_by);

create index if not exists family_members_family_role_status_idx
  on public.family_members (family_id, role, status, profile_id);

create or replace function private.ensure_account_space(
  p_user_id uuid,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id uuid;
  v_space_name text := coalesce(nullif(trim(p_display_name), ''), 'Tài khoản');
begin
  if p_user_id is null then
    raise exception 'Account is required';
  end if;

  select family.id
  into v_space_id
  from public.families family
  where family.created_by = p_user_id
  order by family.created_at, family.id
  limit 1;

  if v_space_id is null then
    insert into public.families (name, created_by)
    values (v_space_name, p_user_id)
    on conflict (created_by) do update
      set name = public.families.name
    returning id into v_space_id;
  end if;

  insert into public.family_members (family_id, profile_id, role, status)
  values (v_space_id, p_user_id, 'parent', 'active')
  on conflict (family_id, profile_id) do update
    set role = 'parent', status = 'active';

  insert into public.family_settings (family_id)
  values (v_space_id)
  on conflict (family_id) do nothing;

  return v_space_id;
end;
$$;

revoke all on function private.ensure_account_space(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.add_child_profile(p_child_name text)
returns table (
  account_space_id uuid,
  parent_profile_id uuid,
  child_profile_id uuid,
  child_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_space_id uuid;
  v_child_id uuid := gen_random_uuid();
  v_child_name text := trim(p_child_name);
  v_user_email text;
  v_user_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if length(v_child_name) < 2 or length(v_child_name) > 100 then
    raise exception 'Child name must contain between 2 and 100 characters';
  end if;

  select
    coalesce(account.email, v_user_id::text || '@users.invalid'),
    coalesce(
      nullif(trim(account.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(coalesce(account.email, ''), '@', 1), ''),
      'Phụ huynh'
    )
  into v_user_email, v_user_name
  from auth.users account
  where account.id = v_user_id;

  insert into public.profiles (id, email, full_name, role)
  values (v_user_id, v_user_email, v_user_name, 'parent')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
        role = 'parent',
        updated_at = now();

  v_space_id := private.ensure_account_space(v_user_id, v_user_name);

  insert into public.profiles (id, email, full_name, role)
  values (
    v_child_id,
    'managed-child-' || v_child_id::text || '@local.invalid',
    v_child_name,
    'child'
  );

  insert into public.family_members (family_id, profile_id, role, status)
  values (v_space_id, v_child_id, 'child', 'active');

  return query select v_space_id, v_user_id, v_child_id, v_child_name;
end;
$$;

revoke all on function private.add_child_profile(text)
  from public, anon, authenticated, service_role;
grant execute on function private.add_child_profile(text) to authenticated;

create or replace function public.add_child_profile(p_child_name text)
returns table (
  account_space_id uuid,
  parent_profile_id uuid,
  child_profile_id uuid,
  child_name text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.add_child_profile(p_child_name);
$$;

revoke all on function public.add_child_profile(text) from public, anon;
grant execute on function public.add_child_profile(text) to authenticated;

create or replace function public.get_account_children()
returns table (
  account_space_id uuid,
  parent_profile_id uuid,
  child_profile_id uuid,
  child_name text,
  child_avatar_url text,
  child_joined_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    family.id,
    (select auth.uid()),
    child_profile.id,
    child_profile.full_name,
    child_profile.avatar_url,
    child_member.joined_at
  from public.families family
  join public.family_members child_member
    on child_member.family_id = family.id
   and child_member.role = 'child'
   and child_member.status = 'active'
  join public.profiles child_profile
    on child_profile.id = child_member.profile_id
  where family.created_by = (select auth.uid())
  order by child_member.joined_at, child_profile.id;
$$;

revoke all on function public.get_account_children() from public, anon;
grant execute on function public.get_account_children() to authenticated;

create or replace function private.update_child_profile(
  p_child_profile_id uuid,
  p_child_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_child_name text := trim(p_child_name);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if length(v_child_name) < 2 or length(v_child_name) > 100 then
    raise exception 'Child name must contain between 2 and 100 characters';
  end if;
  if not exists (
    select 1
    from public.families family
    join public.family_members child_member
      on child_member.family_id = family.id
     and child_member.profile_id = p_child_profile_id
     and child_member.role = 'child'
     and child_member.status = 'active'
    where family.created_by = (select auth.uid())
  ) then
    raise exception 'Child profile is not owned by this account';
  end if;

  update public.profiles
  set full_name = v_child_name, updated_at = now()
  where id = p_child_profile_id;

  return found;
end;
$$;

revoke all on function private.update_child_profile(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.update_child_profile(uuid, text) to authenticated;

create or replace function public.update_child_profile(
  p_child_profile_id uuid,
  p_child_name text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_child_profile(p_child_profile_id, p_child_name);
$$;

revoke all on function public.update_child_profile(uuid, text) from public, anon;
grant execute on function public.update_child_profile(uuid, text) to authenticated;

create or replace function private.clear_child_data(p_child_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_count integer := 0;
  v_rows integer := 0;
begin
  select family.id
  into v_family_id
  from public.families family
  join public.family_members child_member
    on child_member.family_id = family.id
   and child_member.profile_id = p_child_profile_id
   and child_member.role = 'child'
   and child_member.status = 'active'
  where family.created_by = (select auth.uid())
  limit 1;

  if v_family_id is null then
    raise exception 'Child profile is not owned by this account';
  end if;

  delete from public.quick_check_answers answer
  using public.learning_sessions session
  where answer.session_id = session.id
    and session.family_id = v_family_id
    and session.child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.session_tasks task
  using public.learning_sessions session
  where task.session_id = session.id
    and session.family_id = v_family_id
    and session.child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.session_events event
  using public.learning_sessions session
  where event.session_id = session.id
    and session.family_id = v_family_id
    and session.child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.approvals approval
  using public.learning_sessions session
  where approval.session_id = session.id
    and session.family_id = v_family_id
    and session.child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.study_lock_events
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.device_commands
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.ai_plans
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.learning_sessions
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.schedule_events
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.learning_goals
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  delete from public.exceptions
  where family_id = v_family_id and child_profile_id = p_child_profile_id;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  return v_count;
end;
$$;

revoke all on function private.clear_child_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.clear_child_data(uuid) to authenticated;

create or replace function public.clear_child_data(p_child_profile_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.clear_child_data(p_child_profile_id);
$$;

revoke all on function public.clear_child_data(uuid) from public, anon;
grant execute on function public.clear_child_data(uuid) to authenticated;

-- New accounts receive their one tenant boundary immediately. Managed children
-- are added later and do not have auth.users rows.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_workspace_is_empty boolean;
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Người dùng'
  );

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@users.invalid'),
    v_display_name,
    'parent'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
        role = 'parent',
        updated_at = now();

  perform private.ensure_account_space(new.id, v_display_name);

  -- Preserve the existing CRM bootstrap in this shared Supabase project.
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

revoke all on function private.handle_new_user()
  from public, anon, authenticated, service_role;

-- Ensure accounts created before this migration also have exactly one space.
do $$
declare
  account record;
begin
  for account in
    select auth_user.id, profile.full_name
    from auth.users auth_user
    join public.profiles profile on profile.id = auth_user.id
  loop
    perform private.ensure_account_space(account.id, account.full_name);
  end loop;
end;
$$;

-- Retire APIs that allowed users to create/switch tenant containers or clear
-- every child's data at once.
drop function if exists public.create_family_with_child(text, text);
drop function if exists private.create_family_with_child(text, text);
drop function if exists public.update_family_profile(uuid, uuid, text, text);
drop function if exists private.update_family_profile(uuid, uuid, text, text);
drop function if exists public.clear_family_data(uuid);
drop function if exists private.clear_family_data(uuid);
