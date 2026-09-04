const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_ACCOUNT_COUNT = 200;
const MAX_ACCOUNT_COUNT = 500;

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseInteger(value, fallback, name, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function parseNumber(value, fallback, name, minimum = 0, maximum = Number.MAX_VALUE) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be a number between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function getLoadTestConfig(env = process.env, { requireServiceRole = false } = {}) {
  const apiUrl = required(env, 'LOAD_TEST_SUPABASE_URL');
  const publishableKey = required(env, 'LOAD_TEST_SUPABASE_PUBLISHABLE_KEY');
  const parsedUrl = new URL(apiUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('LOAD_TEST_SUPABASE_URL must use http or https.');
  }

  const isLocal = LOCAL_HOSTS.has(parsedUrl.hostname);
  if (!isLocal) {
    if (env.LOAD_TEST_ALLOW_REMOTE !== 'true') {
      throw new Error('Refusing a remote load test without LOAD_TEST_ALLOW_REMOTE=true.');
    }
    if (env.LOAD_TEST_ENVIRONMENT !== 'staging') {
      throw new Error('Remote load tests require LOAD_TEST_ENVIRONMENT=staging.');
    }
    if (env.LOAD_TEST_CONFIRM_HOST !== parsedUrl.host) {
      throw new Error(`Set LOAD_TEST_CONFIRM_HOST=${parsedUrl.host} to confirm the exact staging target.`);
    }
  }

  const accountCount = parseInteger(
    env.LOAD_TEST_ACCOUNT_COUNT,
    DEFAULT_ACCOUNT_COUNT,
    'LOAD_TEST_ACCOUNT_COUNT',
    1,
    env.LOAD_TEST_ALLOW_LARGE === 'true' ? 5000 : MAX_ACCOUNT_COUNT,
  );
  const runId = (env.LOAD_TEST_RUN_ID ?? (isLocal ? 'local' : '')).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(runId)) {
    throw new Error('LOAD_TEST_RUN_ID must use 1-32 lowercase letters, digits or hyphens.');
  }
  const password = required(env, 'LOAD_TEST_PASSWORD');
  if (password.length < 12) throw new Error('LOAD_TEST_PASSWORD must contain at least 12 characters.');

  return {
    accountCount,
    apiUrl: parsedUrl.toString().replace(/\/$/, ''),
    emailDomain: (env.LOAD_TEST_EMAIL_DOMAIN ?? 'example.test').trim().toLowerCase(),
    emailPrefix: `genaily-loadtest-${runId}`,
    isLocal,
    password,
    publishableKey,
    runId,
    serviceRoleKey: requireServiceRole ? required(env, 'LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY') : undefined,
  };
}

export function makeLoadTestAccount(config, zeroBasedIndex) {
  const sequence = String(zeroBasedIndex + 1).padStart(4, '0');
  return {
    childEmail: `${config.emailPrefix}-child-${sequence}@${config.emailDomain}`,
    email: `${config.emailPrefix}-${sequence}@${config.emailDomain}`,
    index: zeroBasedIndex + 1,
    label: `Tài khoản tải ${sequence}`,
  };
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const workerCount = Math.min(items.length, Math.max(1, concurrency));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export function percentile(values, percentage) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentage / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function formatError(error) {
  if (!error || typeof error !== 'object') return String(error);
  const message = 'message' in error ? String(error.message) : JSON.stringify(error);
  const status = 'status' in error && error.status ? ` [${String(error.status)}]` : '';
  const code = 'code' in error && error.code ? ` (${String(error.code)})` : '';
  return `${message}${code}${status}`;
}
