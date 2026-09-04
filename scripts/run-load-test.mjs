import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';
import {
  formatError,
  getLoadTestConfig,
  makeLoadTestAccount,
  mapWithConcurrency,
  parseInteger,
  parseNumber,
  percentile,
} from './load-test-common.mjs';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/run-load-test.mjs');
  console.log('See docs/LOAD_TESTING.md for setup, safety guards and thresholds.');
} else {
  await main();
}

class Metrics {
  samples = new Map();

  record(name, durationMs, error) {
    const current = this.samples.get(name) ?? [];
    current.push({ durationMs, error: error ? formatError(error) : null });
    this.samples.set(name, current);
  }

  summary() {
    return Object.fromEntries([...this.samples.entries()].map(([name, samples]) => {
      const durations = samples.map((sample) => sample.durationMs);
      const failures = samples.filter((sample) => sample.error);
      return [name, {
        count: samples.length,
        errorRate: samples.length === 0 ? 0 : failures.length / samples.length,
        errors: failures.slice(0, 5).map((sample) => sample.error),
        maxMs: Math.round(Math.max(0, ...durations)),
        p50Ms: Math.round(percentile(durations, 50)),
        p95Ms: Math.round(percentile(durations, 95)),
        p99Ms: Math.round(percentile(durations, 99)),
      }];
    }));
  }
}

async function measured(metrics, name, operation) {
  const startedAt = performance.now();
  try {
    const result = await operation();
    if (result && typeof result === 'object' && 'error' in result && result.error) throw result.error;
    metrics.record(name, performance.now() - startedAt);
    return result;
  } catch (error) {
    metrics.record(name, performance.now() - startedAt, error);
    throw error;
  }
}

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfWeek(date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(0, 0, 0, 0);
  return result;
}

function dashboardWindow() {
  const now = new Date();
  const sessionEnd = new Date(now);
  sessionEnd.setHours(23, 59, 59, 999);
  const occurrenceStart = startOfWeek(now);
  return {
    occurrenceEnd: addDays(occurrenceStart, 8),
    occurrenceStart,
    sessionEnd,
  };
}

function assertValidSnapshot(result, account) {
  const snapshot = result.data;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error(`Snapshot is not an object for synthetic account ${account.index}.`);
  }
  if (typeof snapshot.schedule_version !== 'string'
      || !/^[0-9a-f]{32}$/.test(snapshot.schedule_version)) {
    throw new Error(`Snapshot schedule_version is invalid for synthetic account ${account.index}.`);
  }
  for (const key of [
    'family_members',
    'profiles',
    'learning_goals',
    'learning_sessions',
    'schedule_events',
    'schedule_occurrences',
    'exceptions',
    'quick_check_questions',
    'device_commands',
    'managed_devices',
    'device_command_deliveries',
    'child_milestones',
    'notifications',
    'session_tasks',
    'quick_check_answers',
    'session_events',
    'subject_suggestions',
  ]) {
    if (!Array.isArray(snapshot[key])) {
      throw new Error(`Snapshot field ${key} is missing for synthetic account ${account.index}.`);
    }
  }
  const members = snapshot.family_members;
  if (!members.some((member) => member.profile_id === account.context.parent_profile_id && member.role === 'parent')
      || !members.some((member) => member.profile_id === account.context.child_profile_id && member.role === 'child')) {
    throw new Error(`Snapshot context mismatch for synthetic account ${account.index}.`);
  }
}

function snapshotParameters(account) {
  const { occurrenceEnd, occurrenceStart, sessionEnd } = dashboardWindow();
  return {
    p_child_profile_id: account.context.child_profile_id,
    p_device_command_limit: 12,
    p_device_delivery_limit: 60,
    p_exception_limit: 20,
    p_family_id: account.context.account_space_id,
    p_milestone_limit: 12,
    p_notification_limit: 30,
    p_occurrence_end: dateKey(occurrenceEnd),
    p_occurrence_limit: 800,
    p_occurrence_start: dateKey(occurrenceStart),
    p_session_end: sessionEnd.toISOString(),
    p_session_limit: 21,
  };
}

async function loadSnapshotDashboard(account, metrics) {
  const result = await measured(metrics, 'dashboard_snapshot', () => account.client.rpc(
    'get_child_dashboard_snapshot',
    snapshotParameters(account),
  ));
  assertValidSnapshot(result, account);
  account.scheduleVersion = result.data.schedule_version;
}

async function preflightSnapshot(account) {
  const result = await account.client.rpc(
    'get_child_dashboard_snapshot',
    snapshotParameters(account),
  );
  if (result.error) {
    throw new Error(
      'Snapshot preflight failed. Apply migration '
      + `20260904084139_optimize_dashboard_concurrency.sql first: ${formatError(result.error)}`,
    );
  }
  assertValidSnapshot(result, account);
  return result.data.schedule_version;
}

async function preflightScheduleSave(account, expectedVersion) {
  const result = await account.client.rpc('save_schedule_setup_v2', {
    p_child_profile_id: account.context.child_profile_id,
    p_events: { load_test_preflight: true },
    p_expected_version: expectedVersion,
    p_family_id: account.context.account_space_id,
  });
  const formatted = formatError(result.error);
  if (!result.error || !formatted.includes('Schedule events must be an array')) {
    if (formatted.includes('PGRST202') || formatted.includes('Could not find the function')) {
      throw new Error(
        'Optimistic schedule save preflight failed. Apply migration '
        + `20260904084247_concurrency_reliability_guards.sql first: ${formatted}`,
      );
    }
    throw new Error(
      'Optimistic schedule save preflight did not return the expected non-mutating '
      + `validation error: ${formatted}`,
    );
  }
}

async function loadLegacyDashboard(account, metrics) {
  const { child_profile_id: childId, account_space_id: familyId, parent_profile_id: parentId } = account.context;
  const { occurrenceEnd, occurrenceStart, sessionEnd } = dashboardWindow();
  const queries = [
    ['family_members', () => account.client.from('family_members').select('profile_id, role, status').eq('family_id', familyId)],
    ['profiles', () => account.client.from('profiles').select('id, full_name, avatar_url, role, grade_level, experience_points').in('id', [parentId, childId])],
    ['learning_goals', () => account.client.from('learning_goals').select('*').eq('family_id', familyId).eq('child_profile_id', childId).order('created_at')],
    ['learning_sessions', () => account.client.from('learning_sessions').select('*').eq('family_id', familyId).eq('child_profile_id', childId).lte('starts_at', sessionEnd.toISOString()).order('starts_at', { ascending: false }).order('id', { ascending: false }).limit(21)],
    ['schedule_events', () => account.client.from('schedule_events').select('*').eq('family_id', familyId).eq('child_profile_id', childId).order('day_of_week').order('start_time').order('sort_order')],
    ['schedule_occurrences', () => account.client.from('schedule_occurrences').select('*').eq('family_id', familyId).eq('child_profile_id', childId).gte('occurrence_date', dateKey(occurrenceStart)).lte('occurrence_date', dateKey(occurrenceEnd)).order('starts_at').limit(800)],
    ['exceptions', () => account.client.from('exceptions').select('*').eq('family_id', familyId).eq('child_profile_id', childId).order('created_at', { ascending: false }).limit(20)],
    ['family_settings', () => account.client.from('family_settings').select('*').eq('family_id', familyId).maybeSingle()],
    ['ai_plans', () => account.client.from('ai_plans').select('*').eq('family_id', familyId).eq('child_profile_id', childId).order('created_at', { ascending: false }).limit(1).maybeSingle()],
    ['quick_check_questions', () => account.client.from('quick_check_questions').select('id, family_id, subject, prompt, options, active, sort_order, created_at, updated_at').eq('family_id', familyId).eq('active', true).order('sort_order')],
    ['device_commands', () => account.client.from('device_commands').select('*').eq('family_id', familyId).eq('child_profile_id', childId).order('created_at', { ascending: false }).limit(12)],
    ['managed_devices', () => account.client.from('managed_devices').select('*').eq('family_id', familyId).eq('child_profile_id', childId).order('created_at', { ascending: false })],
    ['device_deliveries', () => account.client.from('device_command_deliveries').select('*').eq('family_id', familyId).eq('child_profile_id', childId).order('created_at', { ascending: false }).limit(60)],
    ['child_milestones', () => account.client.from('child_milestones').select('*').eq('family_id', familyId).eq('child_profile_id', childId).order('created_at', { ascending: false }).limit(12)],
    ['notifications', () => account.client.from('notifications').select('*').eq('family_id', familyId).eq('recipient_id', parentId).order('created_at', { ascending: false }).limit(30)],
    ['subject_suggestions', () => account.client.rpc('get_subject_suggestions', { p_child_profile_id: childId })],
  ];
  await measured(metrics, 'dashboard_legacy_fanout', () => Promise.all(
    queries.map(([name, query]) => measured(metrics, `query_${name}`, query)),
  ));
}

async function loadDashboard(account, metrics, dashboardMode) {
  await measured(metrics, 'dashboard_total', () => (
    dashboardMode === 'snapshot'
      ? loadSnapshotDashboard(account, metrics)
      : loadLegacyDashboard(account, metrics)
  ));
}

function schedulePayload(account, runId) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
  return days.map((day, index) => ({
    day_of_week: day,
    duration_minutes: 45,
    event_type: 'self_study',
    sort_order: index,
    start_time: `${String(16 + (index % 2)).padStart(2, '0')}:00`,
    study_lock_enabled: true,
    subject: 'Toán',
    title: `Load ${runId} ${String(account.index).padStart(4, '0')}`,
  }));
}

async function saveAndVerifySchedule(account, metrics, runId) {
  const payload = schedulePayload(account, runId);
  if (!account.scheduleVersion) {
    const snapshot = await measured(metrics, 'schedule_version_read', () => account.client.rpc(
      'get_child_dashboard_snapshot',
      snapshotParameters(account),
    ));
    assertValidSnapshot(snapshot, account);
    account.scheduleVersion = snapshot.data.schedule_version;
  }
  try {
    await measured(metrics, 'schedule_save', () => account.client.rpc('save_schedule_setup_v2', {
      p_child_profile_id: account.context.child_profile_id,
      p_events: payload,
      p_expected_version: account.scheduleVersion,
      p_family_id: account.context.account_space_id,
    }));
  } catch (error) {
    const formatted = formatError(error);
    if (formatted.includes('PGRST202') || formatted.includes('Could not find the function')) {
      throw new Error(
        'Optimistic schedule save is unavailable. Apply migration '
        + `20260904084247_concurrency_reliability_guards.sql first: ${formatted}`,
        { cause: error },
      );
    }
    throw error;
  }
  const verification = await measured(metrics, 'schedule_verify', () => account.client.from('schedule_events')
    .select('id, title, day_of_week, study_lock_enabled')
    .eq('family_id', account.context.account_space_id)
    .eq('child_profile_id', account.context.child_profile_id));
  if (verification.data?.length !== payload.length
      || verification.data.some((event) => !event.study_lock_enabled || !event.title.startsWith(`Load ${runId}`))) {
    throw new Error(`Schedule verification failed for synthetic account ${account.index}.`);
  }
}

async function authenticateAccount(config, definition, metrics) {
  const client = createClient(config.apiUrl, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'genaily-loadtest-v1' } },
  });
  const auth = await measured(metrics, 'auth_sign_in', () => client.auth.signInWithPassword({
    email: definition.email,
    password: config.password,
  }));
  if (!auth.data.session) throw new Error(`No session returned for synthetic account ${definition.index}.`);
  const children = await measured(metrics, 'account_context', () => client.rpc('get_account_children'));
  if (children.data?.length !== 1) {
    throw new Error(`Expected one child for synthetic account ${definition.index}, received ${children.data?.length ?? 0}.`);
  }
  return { ...definition, client, context: children.data[0] };
}

async function subscribeRealtime(account, metrics, timeoutMs) {
  const childFilter = `child_profile_id=eq.${account.context.child_profile_id}`;
  const notificationFilter = `recipient_id=eq.${account.context.parent_profile_id}`;
  account.realtimeEvents = 0;
  const channel = account.client.channel(`loadtest-${account.index}-${Date.now()}`);
  account.realtimeChannel = channel;
  for (const table of [
    'learning_sessions',
    'schedule_events',
    'schedule_occurrences',
    'learning_goals',
    'exceptions',
    'device_commands',
    'device_command_deliveries',
    'ai_plans',
    'child_milestones',
  ]) {
    channel.on(
      'postgres_changes',
      { event: '*', filter: childFilter, schema: 'public', table },
      () => { account.realtimeEvents += 1; },
    );
  }
  channel.on(
    'postgres_changes',
    { event: '*', filter: notificationFilter, schema: 'public', table: 'notifications' },
    () => { account.realtimeEvents += 1; },
  );
  await measured(metrics, 'realtime_subscribe', () => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error(`Realtime subscription timed out for account ${account.index}.`)),
      timeoutMs,
    );
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') finish();
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        finish(new Error(`Realtime subscription ${status} for account ${account.index}.`));
      }
    });
  }));
}

function evaluateThresholds(summary, settings) {
  const failures = [];
  for (const [name, metric] of Object.entries(summary)) {
    if (metric.errorRate > settings.maxErrorRate) {
      failures.push(`${name} error rate ${(metric.errorRate * 100).toFixed(2)}% > ${(settings.maxErrorRate * 100).toFixed(2)}%`);
    }
  }
  if ((summary.dashboard_total?.p95Ms ?? 0) > settings.dashboardP95Ms) {
    failures.push(`dashboard p95 ${summary.dashboard_total.p95Ms}ms > ${settings.dashboardP95Ms}ms`);
  }
  if (summary.schedule_save && summary.schedule_save.p95Ms > settings.scheduleP95Ms) {
    failures.push(`schedule save p95 ${summary.schedule_save.p95Ms}ms > ${settings.scheduleP95Ms}ms`);
  }
  return failures;
}

async function main() {
  const config = getLoadTestConfig();
  const dashboardMode = process.env.LOAD_TEST_DASHBOARD_MODE ?? 'snapshot';
  if (!['snapshot', 'legacy'].includes(dashboardMode)) {
    throw new Error('LOAD_TEST_DASHBOARD_MODE must be snapshot or legacy.');
  }
  const settings = {
    authConcurrency: parseInteger(process.env.LOAD_TEST_AUTH_CONCURRENCY, 20, 'LOAD_TEST_AUTH_CONCURRENCY', 1, 200),
    dashboardP95Ms: parseInteger(process.env.LOAD_TEST_DASHBOARD_P95_MS, 2500, 'LOAD_TEST_DASHBOARD_P95_MS', 1),
    iterations: parseInteger(process.env.LOAD_TEST_ITERATIONS, 1, 'LOAD_TEST_ITERATIONS', 1, 20),
    durationSeconds: parseInteger(process.env.LOAD_TEST_DURATION_SECONDS, 0, 'LOAD_TEST_DURATION_SECONDS', 0, 1800),
    maxErrorRate: parseNumber(process.env.LOAD_TEST_MAX_ERROR_RATE, 0.01, 'LOAD_TEST_MAX_ERROR_RATE', 0, 1),
    mutateSchedule: process.env.LOAD_TEST_MUTATE_SCHEDULE === 'true',
    realtime: process.env.LOAD_TEST_REALTIME === 'true',
    realtimeTimeoutMs: parseInteger(process.env.LOAD_TEST_REALTIME_TIMEOUT_MS, 10000, 'LOAD_TEST_REALTIME_TIMEOUT_MS', 1000, 60000),
    scheduleP95Ms: parseInteger(process.env.LOAD_TEST_SCHEDULE_P95_MS, 3000, 'LOAD_TEST_SCHEDULE_P95_MS', 1),
    thinkTimeMs: parseInteger(process.env.LOAD_TEST_THINK_TIME_MS, 250, 'LOAD_TEST_THINK_TIME_MS', 0, 60000),
  };
  if (settings.mutateSchedule && (settings.iterations !== 1 || settings.durationSeconds > 0)) {
    throw new Error('Schedule mutation requires one iteration and no duration to avoid synthetic occurrence bloat.');
  }
  const definitions = Array.from(
    { length: config.accountCount },
    (_, index) => makeLoadTestAccount(config, index),
  );
  const metrics = new Metrics();
  const setupStartedAt = performance.now();
  const authResults = await mapWithConcurrency(definitions, settings.authConcurrency, async (definition) => {
    try {
      return { account: await authenticateAccount(config, definition, metrics), ok: true };
    } catch (error) {
      return { error: formatError(error), index: definition.index, ok: false };
    }
  });
  const authFailures = authResults.filter((result) => !result.ok);
  if (authFailures.length > 0) {
    console.error(JSON.stringify({ authFailures: authFailures.slice(0, 20), totalFailures: authFailures.length }, null, 2));
    throw new Error('Authentication setup failed; workload was not started. Check Auth rate limits and seed data.');
  }
  const accounts = authResults.map((result) => result.account);
  const authSetupMs = Math.round(performance.now() - setupStartedAt);
  const preflightStartedAt = performance.now();
  if (dashboardMode === 'snapshot' || settings.mutateSchedule) {
    const version = await preflightSnapshot(accounts[0]);
    if (settings.mutateSchedule) await preflightScheduleSave(accounts[0], version);
  }
  const preflightMs = Math.round(performance.now() - preflightStartedAt);
  const realtimeSetupStartedAt = performance.now();
  let dashboardLoadCount = 0;
  const realtimeFailures = settings.realtime
    ? (await Promise.all(accounts.map(async (account) => {
      try {
        await subscribeRealtime(account, metrics, settings.realtimeTimeoutMs);
        return { ok: true };
      } catch (error) {
        return { error: formatError(error), index: account.index, ok: false };
      }
    }))).filter((result) => !result.ok)
    : [];
  const realtimeSetupMs = Math.round(performance.now() - realtimeSetupStartedAt);
  const workloadStartedAt = performance.now();
  const workloadDeadline = settings.durationSeconds > 0
    ? Date.now() + settings.durationSeconds * 1000
    : null;
  const workloads = await Promise.all(accounts.map(async (account) => {
    try {
      let iteration = 0;
      do {
        await loadDashboard(account, metrics, dashboardMode);
        dashboardLoadCount += 1;
        if (settings.mutateSchedule) await saveAndVerifySchedule(account, metrics, config.runId);
        iteration += 1;
        const shouldContinue = workloadDeadline === null
          ? iteration < settings.iterations
          : Date.now() < workloadDeadline;
        if (shouldContinue && settings.thinkTimeMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, settings.thinkTimeMs));
        }
      } while (workloadDeadline === null
        ? iteration < settings.iterations
        : Date.now() < workloadDeadline);
      return { ok: true };
    } catch (error) {
      return { error: formatError(error), index: account.index, ok: false };
    }
  }));
  if (settings.realtime && settings.mutateSchedule) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const workloadDurationMs = performance.now() - workloadStartedAt;
  await Promise.all(accounts.map(async (account) => {
    if (account.realtimeChannel) await account.client.removeChannel(account.realtimeChannel);
  }));
  const summary = metrics.summary();
  const workloadRequestCount = [...metrics.samples.entries()]
    .filter(([name]) => (
      name === 'dashboard_snapshot'
      || name.startsWith('query_')
      || name === 'schedule_version_read'
      || name === 'schedule_save'
      || name === 'schedule_verify'
    ))
    .reduce((sum, [, samples]) => sum + samples.length, 0);
  const workloadFailures = workloads.filter((result) => !result.ok);
  const thresholdFailures = evaluateThresholds(summary, settings);
  const report = {
    accounts: config.accountCount,
    authSetupMs,
    dashboardMode,
    dashboardLoadCount,
    dashboardLoadsPerSecond: Number((
      dashboardLoadCount / Math.max(0.001, workloadDurationMs / 1000)
    ).toFixed(2)),
    durationSeconds: settings.durationSeconds,
    iterationTarget: settings.durationSeconds > 0 ? null : settings.iterations,
    mutateSchedule: settings.mutateSchedule,
    preflightMs,
    requestsPerSecond: Number((
      workloadRequestCount
      / Math.max(0.001, workloadDurationMs / 1000)
    ).toFixed(2)),
    runId: config.runId,
    realtime: settings.realtime,
    realtimeEventCount: accounts.reduce((sum, account) => sum + (account.realtimeEvents ?? 0), 0),
    realtimeFailures: realtimeFailures.slice(0, 20),
    realtimeFailureCount: realtimeFailures.length,
    realtimeSetupMs,
    summary,
    thresholdFailures,
    workloadDurationMs: Math.round(workloadDurationMs),
    workloadFailures: workloadFailures.slice(0, 20),
    workloadFailureCount: workloadFailures.length,
  };
  console.log(JSON.stringify(report, null, 2));
  if (realtimeFailures.length > 0 || workloadFailures.length > 0 || thresholdFailures.length > 0) {
    process.exitCode = 1;
  }
}
