begin;

create extension if not exists pgtap with schema extensions;
select plan(99);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.app_device_modes'::regclass
  ),
  'private app device modes table has RLS enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.account_app_onboarding'::regclass
  ),
  'private app onboarding table has RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'private.account_app_onboarding', 'SELECT'),
  'authenticated users cannot read onboarding rows directly'
);
select ok(
  has_function_privilege('authenticated', 'public.get_app_onboarding_status()', 'EXECUTE'),
  'authenticated users can query their onboarding status through the protected RPC'
);
select ok(
  not has_function_privilege('anon', 'public.get_app_onboarding_status()', 'EXECUTE'),
  'anonymous users cannot query app onboarding status'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.complete_app_onboarding(text,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated users can call the protected onboarding completion RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_app_onboarding(text,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot complete app onboarding'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'parent-rls@example.test', '{"full_name":"Parent RLS"}'::jsonb),
  ('10000000-0000-4000-8000-000000000002', 'child-rls@example.test', '{"full_name":"Child RLS"}'::jsonb),
  ('10000000-0000-4000-8000-000000000003', 'member-rls@example.test', '{"full_name":"Member RLS"}'::jsonb),
  ('10000000-0000-4000-8000-000000000004', 'outsider-rls@example.test', '{"full_name":"Outsider RLS"}'::jsonb),
  ('10000000-0000-4000-8000-000000000005', 'sibling-rls@example.test', '{"full_name":"Sibling RLS"}'::jsonb);

insert into public.family_members (family_id, profile_id, role, status)
select family.id, '10000000-0000-4000-8000-000000000002'::uuid, 'child', 'active'
from public.families family
where family.created_by = '10000000-0000-4000-8000-000000000001'::uuid
on conflict (family_id, profile_id) do update set role = 'child', status = 'active';

insert into public.family_members (family_id, profile_id, role, status)
select family.id, '10000000-0000-4000-8000-000000000005'::uuid, 'child', 'active'
from public.families family
where family.created_by = '10000000-0000-4000-8000-000000000001'::uuid
on conflict (family_id, profile_id) do update set role = 'child', status = 'active';

insert into public.family_members (family_id, profile_id, role, status)
select family.id, '10000000-0000-4000-8000-000000000003'::uuid, 'guardian', 'active'
from public.families family
where family.created_by = '10000000-0000-4000-8000-000000000001'::uuid
on conflict (family_id, profile_id) do update set role = 'guardian', status = 'active';

insert into public.schedule_events (
  id, family_id, child_profile_id, title, event_type, subject, day_of_week,
  start_time, duration_minutes, status, sort_order, study_lock_enabled
)
select
  '20000000-0000-4000-8000-000000000001'::uuid,
  family.id,
  '10000000-0000-4000-8000-000000000002'::uuid,
  'Lịch kiểm thử',
  'self_study',
  'Toán',
  'mon',
  '19:00'::time,
  45,
  'upcoming',
  10,
  false
from public.families family
where family.created_by = '10000000-0000-4000-8000-000000000001'::uuid;

insert into public.learning_sessions (
  id, family_id, child_profile_id, title, subject, status, starts_at,
  duration_minutes, approval_policy
)
select
  '30000000-0000-4000-8000-000000000001'::uuid,
  family.id,
  '10000000-0000-4000-8000-000000000002'::uuid,
  'Phiên kiểm thử',
  'Toán',
  'scheduled',
  now(),
  45,
  'parent_required'
from public.families family
where family.created_by = '10000000-0000-4000-8000-000000000001'::uuid;

insert into public.learning_sessions (
  id, family_id, child_profile_id, title, subject, status, starts_at,
  duration_minutes, approval_policy
)
select
  session_id,
  family.id,
  '10000000-0000-4000-8000-000000000002'::uuid,
  title,
  'Toán',
  'scheduled',
  starts_at,
  45,
  'parent_required'
from public.families family
cross join (values
  ('30000000-0000-4000-8000-000000000002'::uuid, 'Phiên ngày mai', now() + interval '1 day'),
  ('30000000-0000-4000-8000-000000000003'::uuid, 'Phiên trùng đang học', now())
) as fixture(session_id, title, starts_at)
where family.created_by = '10000000-0000-4000-8000-000000000001'::uuid;

create temporary table rls_test_context (family_id uuid not null);
insert into rls_test_context (family_id)
select id from public.families
where created_by = '10000000-0000-4000-8000-000000000001'::uuid;
grant select on rls_test_context to authenticated;

select ok(
  not has_table_privilege('authenticated', 'public.schedule_events', 'INSERT'),
  'authenticated cannot insert schedule rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.learning_sessions', 'UPDATE'),
  'authenticated cannot update session rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.child_milestones', 'INSERT'),
  'authenticated cannot insert milestone rows directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_child_milestone(uuid,uuid,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated can execute the protected milestone RPC'
);
select ok(
  not has_function_privilege('anon', 'public.save_session_note(uuid,text)', 'EXECUTE'),
  'anonymous users cannot execute the child note RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.save_schedule_setup(uuid,uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated can execute the audited schedule RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.update_device_command_delivery(uuid,text,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot forge device delivery state'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.update_device_command_delivery(uuid,text,text,text)',
    'EXECUTE'
  ),
  'only the server delivery role can update device delivery state'
);
select ok(
  not has_table_privilege('authenticated', 'public.schedule_occurrences', 'INSERT'),
  'authenticated cannot forge schedule occurrences'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_device_command(uuid)', 'EXECUTE'),
  'authenticated cannot claim a device delivery job'
);
select ok(
  has_function_privilege('service_role', 'public.claim_device_command(uuid)', 'EXECUTE'),
  'service role can atomically claim a device delivery job'
);
select ok(
  not has_function_privilege('authenticated', 'private.add_child_profile(text)', 'EXECUTE'),
  'authenticated cannot bypass the protected add-child wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'private.add_child_profile_with_grade(text,smallint)', 'EXECUTE'),
  'authenticated cannot bypass the protected graded add-child wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'private.update_child_profile(uuid,text)', 'EXECUTE'),
  'authenticated cannot bypass the protected update-child wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'private.update_child_profile_details(uuid,text,smallint)', 'EXECUTE'),
  'authenticated cannot bypass the protected child-details wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'private.clear_child_data(uuid)', 'EXECUTE'),
  'authenticated cannot bypass the protected clear-child wrapper'
);
select has_index(
  'public',
  'learning_sessions',
  'learning_sessions_one_active_per_child',
  'database enforces one active learning session per child'
);
select has_index(
  'public',
  'schedule_occurrences',
  'schedule_occurrences_event_date_key',
  'database prevents duplicate recurring occurrences'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.managed_devices'::regclass),
  'managed devices table has RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.managed_devices'::regclass),
  'managed devices table forces RLS for ordinary owners'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.device_command_deliveries'::regclass),
  'device command deliveries table has RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.device_command_deliveries'::regclass),
  'device command deliveries table forces RLS for ordinary owners'
);
select ok(
  not has_table_privilege('authenticated', 'public.managed_devices', 'INSERT'),
  'authenticated cannot insert managed devices directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.device_command_deliveries', 'UPDATE'),
  'authenticated cannot forge companion acknowledgement directly'
);
select ok(
  has_function_privilege('authenticated', 'public.create_device_pairing(uuid,uuid,text,text,jsonb)', 'EXECUTE'),
  'authenticated can execute protected device pairing RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.revoke_managed_device(uuid)', 'EXECUTE'),
  'authenticated can execute protected device revocation RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.update_managed_device_policy(uuid,jsonb)', 'EXECUTE'),
  'authenticated can execute protected device policy RPC'
);
select ok(
  not has_function_privilege('anon', 'public.create_device_pairing(uuid,uuid,text,text,jsonb)', 'EXECUTE'),
  'anonymous users cannot create a device pairing'
);
select ok(
  not has_function_privilege('authenticated', 'public.prepare_device_command_for_agents(uuid)', 'EXECUTE'),
  'authenticated cannot prepare device delivery jobs'
);
select ok(
  has_function_privilege('service_role', 'public.prepare_device_command_for_agents(uuid)', 'EXECUTE'),
  'service role can prepare device delivery jobs'
);
select results_eq(
  $$select count(*) from storage.buckets where id = 'child-avatars' and not public$$,
  array[1::bigint],
  'child avatars use a private storage bucket'
);
select ok(
  has_function_privilege('authenticated', 'public.update_child_avatar(uuid,uuid,text)', 'EXECUTE'),
  'authenticated users can call the protected child avatar RPC'
);
select ok(
  not has_function_privilege('anon', 'public.update_child_avatar(uuid,uuid,text)', 'EXECUTE'),
  'anonymous users cannot update a child avatar'
);

insert into storage.objects (bucket_id, name, owner_id)
select
  'child-avatars',
  family_id::text || '/10000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000001.jpg',
  '10000000-0000-4000-8000-000000000001'
from rls_test_context;

do $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id from rls_test_context;
  perform private.materialize_schedule_window(
    v_family_id, '10000000-0000-4000-8000-000000000002'::uuid, current_date, 42
  );
  perform private.materialize_schedule_window(
    v_family_id, '10000000-0000-4000-8000-000000000002'::uuid, current_date, 42
  );
end $$;
select is(
  (
    select count(*)
    from public.schedule_occurrences occurrence
    where occurrence.schedule_event_id = '20000000-0000-4000-8000-000000000001'::uuid
  ),
  (
    select count(distinct occurrence.occurrence_date)
    from public.schedule_occurrences occurrence
    where occurrence.schedule_event_id = '20000000-0000-4000-8000-000000000001'::uuid
  ),
  'repeated materialization creates one occurrence per schedule date'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select results_eq(
  $$select count(*) from public.schedule_events where id = '20000000-0000-4000-8000-000000000001'::uuid$$,
  array[1::bigint],
  'parent reads the child schedule'
);
select is(
  private.can_access_session_evidence(
    (select family_id from rls_test_context),
    '30000000-0000-4000-8000-000000000001'::uuid
  ),
  true,
  'parent can access evidence for the child session'
);

select lives_ok(
  $$select public.create_learning_goal(
    (select id from public.families where created_by = '10000000-0000-4000-8000-000000000001'::uuid),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Toán',
    60
  )$$,
  'parent creates a goal through the audited RPC'
);
select lives_ok(
  $$select public.create_device_pairing(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Android kiểm thử',
    'android',
    null
  )$$,
  'parent creates a one-time companion pairing'
);
select results_eq(
  $$select count(*) from public.managed_devices where child_profile_id = '10000000-0000-4000-8000-000000000002'::uuid$$,
  array[1::bigint],
  'parent reads only the paired device in the account'
);
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'child-avatars'$$,
  array[1::bigint],
  'parent can read the child avatar object'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    select
      'child-avatars',
      family_id::text || '/10000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000002.png',
      '10000000-0000-4000-8000-000000000001'
    from rls_test_context$$,
  'parent can upload an avatar only inside the owned child path'
);
select lives_ok(
  $$select public.update_child_avatar(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    (select name from storage.objects where bucket_id = 'child-avatars' limit 1)
  )$$,
  'parent can attach an uploaded avatar to the owned child'
);
select isnt(
  (select avatar_url from public.profiles where id = '10000000-0000-4000-8000-000000000002'::uuid),
  null::text,
  'the child profile stores the private avatar object path'
);

select throws_ok(
  $$select public.save_schedule_setup(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    jsonb_build_array(jsonb_build_object(
      'id', '20000000-0000-4000-8000-000000000001',
      'title', 'Lịch kiểm thử', 'subject', 'Toán', 'event_type', 'self_study',
      'day_of_week', 'mon', 'start_time', '19:00', 'duration_minutes', 45,
      'sort_order', 10, 'study_lock_enabled', false
    ))
  )$$,
  'P0001',
  'Invalid schedule item',
  'server rejects a learning schedule without Study Lock'
);

do $$
begin
  for attempt in 1..5 loop
    perform public.claim_ai_plan_quota(
      (select family_id from rls_test_context),
      '10000000-0000-4000-8000-000000000002'::uuid
    );
  end loop;
end $$;
select throws_ok(
  $$select public.claim_ai_plan_quota(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid
  )$$,
  'P0001',
  'AI_DAILY_QUOTA_EXCEEDED',
  'server atomically rejects AI requests beyond the family daily quota'
);

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"parent-device-session-one"}';
select is(
  public.get_app_onboarding_status(),
  false,
  'a parent account initially requires the one-time app-mode choice'
);
select throws_ok(
  $$select public.complete_app_onboarding('invalid')$$,
  'P0001',
  'Invalid app mode',
  'the onboarding RPC rejects an unknown app mode'
);
select throws_ok(
  $$select public.complete_app_onboarding(
    'child',
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000004'::uuid
  )$$,
  'P0001',
  'Parent access required',
  'the onboarding RPC rejects a child outside the parent account'
);
select results_eq(
  $$select app_mode || ':' || child_profile_id::text
    from public.complete_app_onboarding(
      'child',
      (select family_id from rls_test_context),
      '10000000-0000-4000-8000-000000000002'::uuid
    )$$,
  array['child:10000000-0000-4000-8000-000000000002'::text],
  'parent completes onboarding by atomically locking the session to the selected child'
);
select is(
  public.get_app_onboarding_status(),
  true,
  'the completed onboarding state is persisted for the parent account'
);
select results_eq(
  $$select app_mode || ':' || child_profile_id::text from public.get_app_mode()$$,
  array['child:10000000-0000-4000-8000-000000000002'::text],
  'server reports the selected managed child as the authoritative app mode'
);
select results_eq(
  $$select count(*) from public.get_account_children() where child_profile_id = '10000000-0000-4000-8000-000000000005'::uuid$$,
  array[0::bigint],
  'managed child mode cannot enumerate a sibling profile'
);
select is_empty(
  $$select id from public.managed_devices$$,
  'managed child mode cannot read device pairing secrets or status'
);
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'child-avatars'$$,
  array[2::bigint],
  'managed child mode can read only the selected child avatar'
);
select throws_ok(
  $$select public.update_child_avatar(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    null
  )$$,
  'P0001',
  'Parent access required',
  'managed child mode cannot change the child avatar'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    select
      'child-avatars',
      family_id::text || '/10000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000003.webp',
      '10000000-0000-4000-8000-000000000001'
    from rls_test_context$$,
  '42501',
  null,
  'managed child mode cannot upload an avatar directly'
);
select throws_ok(
  $$select public.enter_child_mode(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000005'::uuid
  )$$,
  'P0001',
  'Parent re-authentication required to change child',
  'managed child mode cannot switch to a sibling without Parent Gate re-authentication'
);
select throws_ok(
  $$select public.create_learning_goal(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Ngữ văn',
    60
  )$$,
  'P0001',
  'Parent access required',
  'parent mutation is denied while the auth session is in child mode'
);
select lives_ok(
  $$select public.start_learning_session('30000000-0000-4000-8000-000000000001'::uuid)$$,
  'managed child mode can run only the selected child workflow'
);
select throws_ok(
  $$select public.start_learning_session('30000000-0000-4000-8000-000000000002'::uuid)$$,
  'P0001',
  'Session can only start on its scheduled date',
  'a child cannot start a future occurrence by calling the RPC directly'
);
select throws_ok(
  $$select public.start_learning_session('30000000-0000-4000-8000-000000000003'::uuid)$$,
  'P0001',
  'Another learning session is already in progress',
  'database prevents two active learning sessions for one child'
);

-- Re-authentication creates a different Supabase session id and restores the
-- parent capability without exposing an "exit child mode" RPC.
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"parent-device-session-two"}';
select results_eq(
  $$select app_mode from public.get_app_mode()$$,
  array['parent'::text],
  'a freshly re-authenticated session is reported as parent mode'
);
select lives_ok(
  $$select public.create_learning_goal(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Tiếng Việt',
    60
  )$$,
  'freshly re-authenticated session restores parent mutations'
);
select lives_ok(
  $$select public.save_child_milestone(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Phần thưởng kiểm thử',
    'Chỉ phụ huynh được thiết lập',
    250
  )$$,
  'parent can create a protected child milestone'
);

select throws_ok(
  $$insert into public.schedule_events (
    family_id, child_profile_id, title, event_type, subject, day_of_week,
    start_time, duration_minutes
  ) values (
    (select id from public.families where created_by = '10000000-0000-4000-8000-000000000001'::uuid),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Ghi trực tiếp', 'self_study', 'Toán', 'tue', '20:00'::time, 30
  )$$,
  '42501',
  null,
  'parent cannot bypass the schedule RPC with a direct insert'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"child-auth-session"}';

select results_eq(
  $$select count(*) from public.schedule_events where id = '20000000-0000-4000-8000-000000000001'::uuid$$,
  array[1::bigint],
  'child reads only data assigned to that child identity'
);
select is(
  private.can_access_session_evidence(
    (select family_id from rls_test_context),
    '30000000-0000-4000-8000-000000000001'::uuid
  ),
  true,
  'matching child identity can access its session evidence'
);
select throws_ok(
  $$select public.create_learning_goal(
    (select family_id from public.family_members where profile_id = '10000000-0000-4000-8000-000000000002'::uuid and role = 'child'),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Toán',
    60
  )$$,
  'P0001',
  'Parent access required',
  'child cannot call a parent mutation RPC'
);
select lives_ok(
  $$select public.request_session_break('30000000-0000-4000-8000-000000000001'::uuid, 10)$$,
  'child identity can continue its own active workflow'
);
select lives_ok(
  $$select public.save_session_note('30000000-0000-4000-8000-000000000001'::uuid, 'Con đã ghi chú bài học')$$,
  'child identity can save a note for its active session'
);
select lives_ok(
  $$select public.send_parent_message(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Con cần hỗ trợ bài kiểm thử'
  )$$,
  'child identity can send a server-owned notification to its parent'
);
select is_empty(
  $$select id from public.notifications$$,
  'child identity cannot read parent notifications'
);
select results_eq(
  $$select count(*) from storage.objects where bucket_id = 'child-avatars'$$,
  array[2::bigint],
  'matching child identity can read its own avatar'
);
select throws_ok(
  $$select public.update_child_avatar(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    null
  )$$,
  'P0001',
  'Parent access required',
  'child identity cannot change its avatar'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","session_id":"member-auth-session"}';

select is_empty(
  $$select id from public.schedule_events where id = '20000000-0000-4000-8000-000000000001'::uuid$$,
  'another family member cannot read child study data'
);
select is(
  private.can_access_session_evidence(
    (select family_id from rls_test_context),
    '30000000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'another family member cannot access child session evidence'
);
select is_empty(
  $$select id from storage.objects where bucket_id = 'child-avatars'$$,
  'another family member cannot read the child avatar'
);
select throws_ok(
  $$select public.create_learning_goal(
    (select family_id from public.family_members where profile_id = '10000000-0000-4000-8000-000000000003'::uuid and role = 'guardian'),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Toán',
    60
  )$$,
  'P0001',
  'Parent access required',
  'another family member cannot call a parent mutation RPC'
);
select throws_ok(
  $$select public.start_learning_session('30000000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001',
  'Child workflow access required',
  'another family member cannot run the child workflow'
);
select throws_ok(
  $$select public.save_session_note('30000000-0000-4000-8000-000000000001'::uuid, 'Ghi chú trái phép')$$,
  'P0001',
  'Child workflow access required',
  'another family member cannot write a child session note'
);

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000004';
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","session_id":"outsider-auth-session"}';

select is(
  public.get_app_onboarding_status(),
  false,
  'a different account has an independent onboarding state'
);
select results_eq(
  $$select app_mode from public.complete_app_onboarding('parent')$$,
  array['parent'::text],
  'an authenticated parent can complete onboarding in parent mode'
);
select is(
  public.get_app_onboarding_status(),
  true,
  'parent-mode onboarding is persisted without creating a child-mode lock'
);

select is_empty(
  $$select id from public.schedule_events where id = '20000000-0000-4000-8000-000000000001'::uuid$$,
  'outsider cannot read another account schedule'
);
select is_empty(
  $$select id from public.child_milestones$$,
  'outsider cannot read another account milestone'
);
select is(
  private.can_access_session_evidence(
    (select family_id from rls_test_context),
    '30000000-0000-4000-8000-000000000001'::uuid
  ),
  false,
  'outsider cannot access child session evidence'
);
select throws_ok(
  $$select public.create_learning_goal(
    (select id from public.families where created_by = '10000000-0000-4000-8000-000000000001'::uuid),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Toán',
    60
  )$$,
  'P0001',
  'Parent access required',
  'outsider cannot call a parent mutation RPC'
);
select throws_ok(
  $$select public.start_learning_session('30000000-0000-4000-8000-000000000001'::uuid)$$,
  'P0001',
  'Child workflow access required',
  'outsider cannot run a child workflow'
);
select throws_ok(
  $$select public.redeem_child_milestone(
    (select id from public.child_milestones limit 1)
  )$$,
  'P0001',
  'Child workflow access required',
  'outsider cannot redeem another account milestone'
);
select throws_ok(
  $$select public.create_device_pairing(
    (select family_id from rls_test_context),
    '10000000-0000-4000-8000-000000000002'::uuid,
    'Thiết bị ngoài',
    'android',
    null
  )$$,
  'P0001',
  'Parent access required',
  'outsider cannot pair a device to another account'
);
select is_empty(
  $$select id from storage.objects where bucket_id = 'child-avatars'$$,
  'outsider cannot read another account child avatar'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    select
      'child-avatars',
      family_id::text || '/10000000-0000-4000-8000-000000000002/40000000-0000-4000-8000-000000000004.jpg',
      '10000000-0000-4000-8000-000000000004'
    from rls_test_context$$,
  '42501',
  null,
  'outsider cannot upload an avatar into another account path'
);

select * from finish();
rollback;
