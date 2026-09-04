-- Applied migration version: 20260904091232.
-- Project-wide semaphore for expensive AI generation. Only an Edge Function
-- using the service role can acquire/release leases; browser roles never see
-- the private slot table or its privileged RPCs.

create table if not exists private.ai_generation_leases (
  slot_number smallint primary key,
  lease_token uuid,
  request_id uuid,
  user_id uuid,
  family_id uuid,
  child_profile_id uuid,
  acquired_at timestamptz,
  expires_at timestamptz,
  constraint ai_generation_leases_slot_check
    check (slot_number between 1 and 32),
  constraint ai_generation_leases_state_check
    check (
      (
        lease_token is null
        and request_id is null
        and user_id is null
        and family_id is null
        and child_profile_id is null
        and acquired_at is null
        and expires_at is null
      )
      or (
        lease_token is not null
        and request_id is not null
        and user_id is not null
        and family_id is not null
        and child_profile_id is not null
        and acquired_at is not null
        and expires_at is not null
        and expires_at > acquired_at
      )
    )
);

alter table private.ai_generation_leases enable row level security;
alter table private.ai_generation_leases force row level security;

create unique index if not exists ai_generation_leases_request_idx
  on private.ai_generation_leases (request_id)
  where request_id is not null;

revoke all on table private.ai_generation_leases
  from public, anon, authenticated, service_role;

create or replace function public.claim_ai_generation_lease(
  p_request_id uuid,
  p_user_id uuid,
  p_family_id uuid,
  p_child_profile_id uuid,
  p_max_concurrency integer default 4,
  p_ttl_seconds integer default 90
)
returns table (
  slot_number smallint,
  lease_token uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_max_concurrency smallint := least(
    greatest(coalesce(p_max_concurrency, 4), 1),
    32
  )::smallint;
  v_ttl_seconds integer := least(
    greatest(coalesce(p_ttl_seconds, 90), 15),
    600
  );
  v_slot_number smallint;
  v_lease_token uuid;
  v_expires_at timestamptz;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role access required';
  end if;
  if p_request_id is null or p_user_id is null
     or p_family_id is null or p_child_profile_id is null then
    raise exception 'AI lease identity is required';
  end if;
  if not exists (
    select 1
    from public.families family
    join public.family_members parent_member
      on parent_member.family_id = family.id
     and parent_member.profile_id = p_user_id
     and parent_member.role = 'parent'
     and parent_member.status = 'active'
    join public.family_members child_member
      on child_member.family_id = family.id
     and child_member.profile_id = p_child_profile_id
     and child_member.role = 'child'
     and child_member.status = 'active'
    where family.id = p_family_id
  ) then
    raise exception 'AI_LEASE_ACCESS_DENIED';
  end if;

  -- Claims are tiny and infrequent relative to inference. Serializing this
  -- section makes the global limit exact without holding a database lock while
  -- Gemini is running.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('genai-family:ai-generation-lease', 0)
  );

  insert into private.ai_generation_leases (slot_number)
  select generated_slot::smallint
  from pg_catalog.generate_series(1, v_max_concurrency) as generated_slot
  on conflict on constraint ai_generation_leases_pkey do nothing;

  -- A crashed Edge invocation cannot retain capacity forever. Clearing first
  -- also releases request IDs so the partial unique index remains idempotent.
  update private.ai_generation_leases generation_lease
  set lease_token = null,
      request_id = null,
      user_id = null,
      family_id = null,
      child_profile_id = null,
      acquired_at = null,
      expires_at = null
  where generation_lease.expires_at <= now();

  -- PostgREST may retry a request after losing the first response. Reusing the
  -- same active lease prevents a single Edge invocation from leaking slots.
  select generation_lease.slot_number,
         generation_lease.lease_token,
         generation_lease.expires_at
  into v_slot_number, v_lease_token, v_expires_at
  from private.ai_generation_leases generation_lease
  where generation_lease.request_id = p_request_id
    and generation_lease.user_id = p_user_id
    and generation_lease.family_id = p_family_id
    and generation_lease.child_profile_id = p_child_profile_id
    and generation_lease.expires_at > now()
  limit 1;

  if v_slot_number is not null then
    return query select v_slot_number, v_lease_token, v_expires_at;
    return;
  end if;

  select generation_lease.slot_number
  into v_slot_number
  from private.ai_generation_leases generation_lease
  where generation_lease.slot_number <= v_max_concurrency
    and generation_lease.lease_token is null
  order by generation_lease.slot_number
  limit 1
  for update;

  if v_slot_number is null then
    return;
  end if;

  v_lease_token := extensions.gen_random_uuid();
  v_expires_at := now() + pg_catalog.make_interval(secs => v_ttl_seconds);

  update private.ai_generation_leases generation_lease
  set lease_token = v_lease_token,
      request_id = p_request_id,
      user_id = p_user_id,
      family_id = p_family_id,
      child_profile_id = p_child_profile_id,
      acquired_at = now(),
      expires_at = v_expires_at
  where generation_lease.slot_number = v_slot_number;

  return query select v_slot_number, v_lease_token, v_expires_at;
end;
$$;

create or replace function public.release_ai_generation_lease(
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role access required';
  end if;
  if p_lease_token is null then
    return false;
  end if;

  update private.ai_generation_leases generation_lease
  set lease_token = null,
      request_id = null,
      user_id = null,
      family_id = null,
      child_profile_id = null,
      acquired_at = null,
      expires_at = null
  where generation_lease.lease_token = p_lease_token;

  return found;
end;
$$;

revoke all on function public.claim_ai_generation_lease(
  uuid, uuid, uuid, uuid, integer, integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.release_ai_generation_lease(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_ai_generation_lease(
  uuid, uuid, uuid, uuid, integer, integer
)
  to service_role;
grant execute on function public.release_ai_generation_lease(uuid)
  to service_role;

notify pgrst, 'reload schema';
