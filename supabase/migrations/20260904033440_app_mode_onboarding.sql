-- Record whether an authenticated parent account has completed the one-time
-- app-mode choice. The preference is deliberately kept outside the exposed
-- schemas: it is UX state, while private.app_device_modes remains the
-- authoritative authorization boundary for the current Supabase session.
create table if not exists private.account_app_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now()
);

alter table private.account_app_onboarding enable row level security;
revoke all on table private.account_app_onboarding
  from public, anon, authenticated, service_role;

create or replace function public.get_app_onboarding_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  return exists (
    select 1
    from private.account_app_onboarding onboarding
    where onboarding.user_id = v_user_id
  );
end;
$$;

create or replace function public.complete_app_onboarding(
  p_mode text,
  p_family_id uuid default null,
  p_child_profile_id uuid default null
)
returns table (
  app_mode text,
  family_id uuid,
  child_profile_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not private.is_parent_account_session() then
    raise exception 'Parent access required';
  end if;
  if p_mode is null or p_mode not in ('parent', 'child') then
    raise exception 'Invalid app mode';
  end if;

  if p_mode = 'parent' then
    if p_family_id is not null or p_child_profile_id is not null then
      raise exception 'Parent mode does not accept child context';
    end if;
  else
    if p_family_id is null or p_child_profile_id is null then
      raise exception 'Child mode requires a child context';
    end if;

    -- Reuse the existing server-side membership and auth-session checks. Both
    -- writes are in this transaction, so a failure cannot leave a partially
    -- completed onboarding record or an unlocked UI/server mismatch.
    perform public.enter_child_mode(p_family_id, p_child_profile_id);
  end if;

  insert into private.account_app_onboarding (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return query
  select mode.app_mode, mode.family_id, mode.child_profile_id
  from public.get_app_mode() mode;
end;
$$;

revoke all on function public.get_app_onboarding_status()
  from public, anon, authenticated, service_role;
revoke all on function public.complete_app_onboarding(text, uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_app_onboarding_status() to authenticated;
grant execute on function public.complete_app_onboarding(text, uuid, uuid)
  to authenticated;
