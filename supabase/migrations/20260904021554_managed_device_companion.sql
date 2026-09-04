-- First-party companion device channel for Android/iOS Study Lock.
-- Raw pairing codes and device tokens are returned once and never persisted.

create table public.managed_devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  child_profile_id uuid not null,
  display_name text not null,
  platform text not null,
  status text not null default 'pairing',
  token_hash text unique,
  pairing_code_hash text unique,
  pairing_expires_at timestamptz,
  policy jsonb not null default '{"blocked_categories":["social","entertainment"],"blocked_apps":[]}'::jsonb,
  policy_version integer not null default 1,
  last_seen_at timestamptz,
  paired_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint managed_devices_child_membership_fkey
    foreign key (family_id, child_profile_id)
    references public.family_members(family_id, profile_id) on delete cascade,
  constraint managed_devices_display_name_check
    check (length(trim(display_name)) between 1 and 80),
  constraint managed_devices_platform_check
    check (platform in ('android', 'ios')),
  constraint managed_devices_status_check
    check (status in ('pairing', 'active', 'revoked')),
  constraint managed_devices_token_hash_check
    check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  constraint managed_devices_pairing_hash_check
    check (pairing_code_hash is null or pairing_code_hash ~ '^[0-9a-f]{64}$'),
  constraint managed_devices_policy_check
    check (jsonb_typeof(policy) = 'object'),
  constraint managed_devices_policy_version_check
    check (policy_version > 0),
  constraint managed_devices_lifecycle_check check (
    (status = 'pairing'
      and token_hash is null
      and pairing_code_hash is not null
      and pairing_expires_at is not null
      and paired_at is null
      and revoked_at is null)
    or (status = 'active'
      and token_hash is not null
      and pairing_code_hash is null
      and pairing_expires_at is null
      and paired_at is not null
      and revoked_at is null)
    or (status = 'revoked'
      and token_hash is null
      and pairing_code_hash is null
      and pairing_expires_at is null
      and revoked_at is not null)
  )
);

create index managed_devices_family_child_idx
  on public.managed_devices (family_id, child_profile_id, created_at desc);
create index managed_devices_active_child_idx
  on public.managed_devices (child_profile_id, last_seen_at desc)
  where status = 'active';
create index managed_devices_pairing_expiry_idx
  on public.managed_devices (pairing_expires_at)
  where status = 'pairing';

create trigger managed_devices_set_updated_at
before update on public.managed_devices
for each row execute function public.set_updated_at();

create table public.device_command_deliveries (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null references public.device_commands(id) on delete cascade,
  device_id uuid not null references public.managed_devices(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id),
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 20,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_command_deliveries_command_device_key unique (command_id, device_id),
  constraint device_command_deliveries_child_membership_fkey
    foreign key (family_id, child_profile_id)
    references public.family_members(family_id, profile_id) on delete cascade,
  constraint device_command_deliveries_status_check
    check (status in ('queued', 'delivered', 'acknowledged', 'failed', 'expired')),
  constraint device_command_deliveries_attempts_check
    check (attempt_count >= 0 and max_attempts between 1 and 100 and attempt_count <= max_attempts),
  constraint device_command_deliveries_error_check
    check (error_message is null or length(error_message) <= 1000)
);

create index device_command_deliveries_device_queue_idx
  on public.device_command_deliveries (device_id, next_attempt_at, created_at)
  where status in ('queued', 'failed');
create index device_command_deliveries_command_status_idx
  on public.device_command_deliveries (command_id, status);
create index device_command_deliveries_family_child_idx
  on public.device_command_deliveries (family_id, child_profile_id, created_at desc);

create trigger device_command_deliveries_set_updated_at
before update on public.device_command_deliveries
for each row execute function public.set_updated_at();

create or replace function private.create_device_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.device_command_deliveries (
    command_id, device_id, family_id, child_profile_id
  )
  select new.id, device.id, new.family_id, new.child_profile_id
  from public.managed_devices device
  where device.family_id = new.family_id
    and device.child_profile_id = new.child_profile_id
    and device.status = 'active'
  on conflict (command_id, device_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_device_deliveries()
  from public, anon, authenticated, service_role;

create trigger device_commands_create_device_deliveries
after insert on public.device_commands
for each row execute function private.create_device_deliveries();

create or replace function public.create_device_pairing(
  p_family_id uuid,
  p_child_profile_id uuid,
  p_display_name text,
  p_platform text,
  p_policy jsonb default null
)
returns table (device_id uuid, pairing_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid := gen_random_uuid();
  v_pairing_code text := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_policy jsonb := coalesce(p_policy,
    '{"blocked_categories":["social","entertainment"],"blocked_apps":[]}'::jsonb);
begin
  if not private.is_family_parent(p_family_id) then
    raise exception 'Parent access required';
  end if;
  if not exists (
    select 1 from public.family_members member
    where member.family_id = p_family_id
      and member.profile_id = p_child_profile_id
      and member.role = 'child'
      and member.status = 'active'
  ) then
    raise exception 'Child profile is not in this account';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'Unsupported device platform';
  end if;
  if length(trim(coalesce(p_display_name, ''))) not between 1 and 80 then
    raise exception 'Invalid device name';
  end if;
  if jsonb_typeof(v_policy) <> 'object' or pg_column_size(v_policy) > 16384 then
    raise exception 'Invalid device policy';
  end if;

  update public.managed_devices
  set status = 'revoked', pairing_code_hash = null, pairing_expires_at = null,
      revoked_at = now()
  where family_id = p_family_id
    and child_profile_id = p_child_profile_id
    and platform = p_platform
    and status = 'pairing';

  insert into public.managed_devices (
    id, family_id, child_profile_id, display_name, platform, status,
    pairing_code_hash, pairing_expires_at, policy, created_by
  ) values (
    v_device_id, p_family_id, p_child_profile_id, trim(p_display_name), p_platform,
    'pairing', encode(extensions.digest(v_pairing_code, 'sha256'), 'hex'),
    v_expires_at, v_policy, (select auth.uid())
  );

  return query select v_device_id, v_pairing_code, v_expires_at;
end;
$$;

create or replace function public.update_managed_device_policy(
  p_device_id uuid,
  p_policy jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if jsonb_typeof(p_policy) <> 'object' or pg_column_size(p_policy) > 16384 then
    raise exception 'Invalid device policy';
  end if;
  update public.managed_devices device
  set policy = p_policy,
      policy_version = policy_version + 1
  where device.id = p_device_id
    and device.status <> 'revoked'
    and private.is_family_parent(device.family_id)
  returning policy_version into v_version;
  if v_version is null then raise exception 'Managed device not found'; end if;
  return v_version;
end;
$$;

create or replace function public.revoke_managed_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.managed_devices device
  set status = 'revoked', token_hash = null, pairing_code_hash = null,
      pairing_expires_at = null, revoked_at = now()
  where device.id = p_device_id
    and device.status <> 'revoked'
    and private.is_family_parent(device.family_id);
  return found;
end;
$$;

create or replace function public.prepare_device_command_for_agents(p_command_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role access required';
  end if;

  insert into public.device_command_deliveries (
    command_id, device_id, family_id, child_profile_id
  )
  select command.id, device.id, command.family_id, command.child_profile_id
  from public.device_commands command
  join public.managed_devices device
    on device.family_id = command.family_id
   and device.child_profile_id = command.child_profile_id
   and device.status = 'active'
  where command.id = p_command_id
  on conflict (command_id, device_id) do nothing;

  select count(*)::integer into v_count
  from public.device_command_deliveries delivery
  join public.managed_devices device on device.id = delivery.device_id
  where delivery.command_id = p_command_id
    and delivery.status in ('queued', 'delivered', 'failed')
    and device.status = 'active';

  if v_count > 0 then
    update public.device_commands
    set status = case when status = 'configuration_required' then 'queued' else status end,
        next_attempt_at = now(),
        error_message = null
    where id = p_command_id;
  end if;
  return v_count;
end;
$$;

alter table public.managed_devices enable row level security;
alter table public.managed_devices force row level security;
alter table public.device_command_deliveries enable row level security;
alter table public.device_command_deliveries force row level security;

create policy "parents read managed devices"
  on public.managed_devices for select to authenticated
  using ((select private.is_family_parent(family_id)));

create policy "parents read device deliveries"
  on public.device_command_deliveries for select to authenticated
  using ((select private.is_family_parent(family_id)));

revoke all on table public.managed_devices, public.device_command_deliveries
  from public, anon, authenticated;
grant select on table public.managed_devices, public.device_command_deliveries
  to authenticated;

revoke all on function public.create_device_pairing(uuid, uuid, text, text, jsonb)
  from public, anon;
revoke all on function public.update_managed_device_policy(uuid, jsonb)
  from public, anon;
revoke all on function public.revoke_managed_device(uuid)
  from public, anon;
grant execute on function public.create_device_pairing(uuid, uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.update_managed_device_policy(uuid, jsonb)
  to authenticated;
grant execute on function public.revoke_managed_device(uuid)
  to authenticated;

revoke all on function public.prepare_device_command_for_agents(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_device_command_for_agents(uuid)
  to service_role;

alter publication supabase_realtime add table public.managed_devices;
alter publication supabase_realtime add table public.device_command_deliveries;

notify pgrst, 'reload schema';
