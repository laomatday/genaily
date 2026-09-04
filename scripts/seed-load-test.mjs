import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  formatError,
  getLoadTestConfig,
  makeLoadTestAccount,
  mapWithConcurrency,
  parseInteger,
} from './load-test-common.mjs';

const command = process.argv[2] ?? 'seed';
if (command === '--help' || command === '-h') {
  console.log('Usage: node scripts/seed-load-test.mjs [seed|cleanup]');
  console.log('See docs/LOAD_TESTING.md for required safety and credential variables.');
} else if (!['seed', 'cleanup'].includes(command)) {
  throw new Error('Expected seed or cleanup.');
} else {
  await main(command);
}

async function listAllUsers(admin) {
  const users = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }
}

async function findRemainingIds(admin, table, ids) {
  const remaining = [];
  const uniqueIds = [...new Set(ids)];
  for (let offset = 0; offset < uniqueIds.length; offset += 80) {
    const batch = uniqueIds.slice(offset, offset + 80);
    const result = await admin.from(table).select('id').in('id', batch);
    if (result.error) throw result.error;
    remaining.push(...(result.data ?? []));
  }
  return remaining;
}

async function deleteSyntheticAccount(admin, user, account) {
  const membership = await admin.from('family_members')
    .select('family_id')
    .eq('profile_id', user.id)
    .eq('role', 'parent');
  if (membership.error) throw membership.error;
  const ownedFamilies = await admin.from('families')
    .select('id')
    .eq('created_by', user.id);
  if (ownedFamilies.error) throw ownedFamilies.error;
  const familyIds = [...new Set([
    ...(membership.data ?? []).map((item) => item.family_id),
    ...(ownedFamilies.data ?? []).map((item) => item.id),
  ])];
  let childIds = [];
  if (familyIds.length > 0) {
    const children = await admin.from('family_members')
      .select('profile_id')
      .in('family_id', familyIds)
      .eq('role', 'child');
    if (children.error) throw children.error;
    childIds = (children.data ?? []).map((item) => item.profile_id);
    const families = await admin.from('families').delete().in('id', familyIds);
    if (families.error) throw families.error;
  }
  const detachedChildren = await admin.from('profiles')
    .select('id')
    .eq('email', account.childEmail)
    .eq('role', 'child');
  if (detachedChildren.error) throw detachedChildren.error;
  childIds.push(...(detachedChildren.data ?? []).map((item) => item.id));
  const profileIds = [...new Set([...childIds, user.id])];
  if (profileIds.length > 0) {
    const profiles = await admin.from('profiles').delete().in('id', profileIds);
    if (profiles.error) throw profiles.error;
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return { familyIds, profileIds };
}

async function ensureChildProfile(admin, user, account) {
  const parentMembership = await admin.from('family_members')
    .select('family_id')
    .eq('profile_id', user.id)
    .eq('role', 'parent')
    .eq('status', 'active');
  if (parentMembership.error) throw parentMembership.error;
  if (parentMembership.data?.length !== 1) {
    throw new Error(
      `Account ${account.index} has no unique parent account space. `
      + 'Verify on_auth_user_created/private.handle_new_user migrations before load testing.',
    );
  }
  const familyId = parentMembership.data[0].family_id;
  const children = await admin.from('family_members')
    .select('profile_id')
    .eq('family_id', familyId)
    .eq('role', 'child')
    .eq('status', 'active');
  if (children.error) throw children.error;
  if ((children.data?.length ?? 0) > 1) {
    throw new Error(`Synthetic account ${account.index} is not isolated: expected at most one child.`);
  }
  if (children.data?.length === 1) {
    return { childId: children.data[0].profile_id, familyId };
  }

  const detachedProfiles = await admin.from('profiles')
    .select('id')
    .eq('email', account.childEmail)
    .eq('role', 'child');
  if (detachedProfiles.error) throw detachedProfiles.error;
  if ((detachedProfiles.data?.length ?? 0) > 1) {
    throw new Error(`Synthetic account ${account.index} has duplicate detached child profiles; run cleanup first.`);
  }
  let childId = detachedProfiles.data?.[0]?.id;
  if (childId) {
    const existingMemberships = await admin.from('family_members')
      .select('family_id')
      .eq('profile_id', childId);
    if (existingMemberships.error) throw existingMemberships.error;
    if ((existingMemberships.data?.length ?? 0) > 0) {
      throw new Error(`Detached child candidate for synthetic account ${account.index} already belongs to an account space.`);
    }
  } else {
    childId = randomUUID();
    const childProfile = await admin.from('profiles').insert({
      email: account.childEmail,
      full_name: `Bé tải ${String(account.index).padStart(4, '0')}`,
      grade_level: ((account.index - 1) % 12) + 1,
      id: childId,
      role: 'child',
    });
    if (childProfile.error) throw childProfile.error;
  }
  const childMembership = await admin.from('family_members').insert({
    family_id: familyId,
    profile_id: childId,
    role: 'child',
    status: 'active',
  });
  if (childMembership.error) {
    const rollback = await admin.from('profiles').delete().eq('id', childId);
    if (rollback.error) {
      throw new AggregateError(
        [childMembership.error, rollback.error],
        `Could not attach or roll back child profile for synthetic account ${account.index}.`,
      );
    }
    throw childMembership.error;
  }
  return { childId, familyId };
}

async function main(mode) {
  const config = getLoadTestConfig(process.env, { requireServiceRole: true });
  if (mode === 'cleanup' && process.env.LOAD_TEST_ALLOW_CLEANUP !== 'true') {
    throw new Error('Cleanup requires LOAD_TEST_ALLOW_CLEANUP=true.');
  }
  const concurrency = parseInteger(
    process.env.LOAD_TEST_SEED_CONCURRENCY,
    8,
    'LOAD_TEST_SEED_CONCURRENCY',
    1,
    32,
  );
  const accounts = Array.from(
    { length: config.accountCount },
    (_, index) => makeLoadTestAccount(config, index),
  );
  const desiredEmails = new Set(accounts.map((account) => account.email));
  const admin = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'genaily-loadtest-seed' } },
  });
  const allUsers = await listAllUsers(admin);
  const existing = new Map(
    allUsers
      .filter((user) => user.email && desiredEmails.has(user.email))
      .map((user) => [user.email, user]),
  );

  if (mode === 'cleanup') {
    const targets = accounts.flatMap((account) => {
      const user = existing.get(account.email);
      return user ? [{ account, user }] : [];
    });
    const deleted = await mapWithConcurrency(
      targets,
      concurrency,
      ({ account, user }) => deleteSyntheticAccount(admin, user, account),
    );
    const familyIds = deleted.flatMap((item) => item.familyIds);
    const profileIds = deleted.flatMap((item) => item.profileIds);
    const remainingUsers = (await listAllUsers(admin))
      .filter((user) => user.email && desiredEmails.has(user.email));
    const remainingFamilies = await findRemainingIds(admin, 'families', familyIds);
    const remainingProfiles = await findRemainingIds(admin, 'profiles', profileIds);
    if (remainingUsers.length > 0
        || remainingFamilies.length > 0
        || remainingProfiles.length > 0) {
      throw new Error('Cleanup verification found remaining synthetic auth or public records.');
    }
    console.log(`Removed ${targets.length} synthetic load-test accounts from ${config.apiUrl}.`);
    return;
  }

  const results = await mapWithConcurrency(accounts, concurrency, async (account) => {
    try {
      let user = existing.get(account.email);
      if (user) {
        const { data, error } = await admin.auth.admin.updateUserById(user.id, {
          password: config.password,
          user_metadata: { full_name: account.label, load_test_run: config.runId },
        });
        if (error) throw error;
        user = data.user;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: account.email,
          email_confirm: true,
          password: config.password,
          user_metadata: { full_name: account.label, load_test_run: config.runId },
        });
        if (error) throw error;
        user = data.user;
      }
      const context = await ensureChildProfile(admin, user, account);
      return { context, ok: true, userId: user.id };
    } catch (error) {
      return { error: formatError(error), index: account.index, ok: false };
    }
  });
  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error(JSON.stringify({ failures: failures.slice(0, 20), totalFailures: failures.length }, null, 2));
    throw new Error(`Failed to seed ${failures.length}/${accounts.length} synthetic accounts.`);
  }
  for (const [label, values] of [
    ['Auth users', results.map((result) => result.userId)],
    ['account spaces', results.map((result) => result.context.familyId)],
    ['child profiles', results.map((result) => result.context.childId)],
  ]) {
    if (new Set(values).size !== accounts.length) {
      throw new Error(`Seed isolation check failed: ${label} are not unique per synthetic account.`);
    }
  }
  console.log(`Prepared ${accounts.length} isolated accounts with one child each on ${config.apiUrl}.`);
}
