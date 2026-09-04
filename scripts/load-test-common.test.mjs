import { describe, expect, it } from 'vitest';
import {
  getLoadTestConfig,
  makeLoadTestAccount,
  parseInteger,
  percentile,
} from './load-test-common.mjs';

const localEnv = {
  LOAD_TEST_PASSWORD: 'test-password-only',
  LOAD_TEST_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
  LOAD_TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
};

describe('load-test safety configuration', () => {
  it('defaults to 200 deterministic synthetic accounts on localhost', () => {
    const config = getLoadTestConfig(localEnv);
    expect(config.accountCount).toBe(200);
    expect(makeLoadTestAccount(config, 199)).toMatchObject({
      childEmail: 'genaily-loadtest-local-child-0200@example.test',
      email: 'genaily-loadtest-local-0200@example.test',
      index: 200,
    });
  });

  it('refuses a remote target without all staging confirmations', () => {
    const remote = {
      ...localEnv,
      LOAD_TEST_RUN_ID: 'staging-200',
      LOAD_TEST_SUPABASE_URL: 'https://project-ref.supabase.co',
    };
    expect(() => getLoadTestConfig(remote)).toThrow(/LOAD_TEST_ALLOW_REMOTE/);
    expect(() => getLoadTestConfig({ ...remote, LOAD_TEST_ALLOW_REMOTE: 'true' }))
      .toThrow(/LOAD_TEST_ENVIRONMENT=staging/);
    expect(() => getLoadTestConfig({
      ...remote,
      LOAD_TEST_ALLOW_REMOTE: 'true',
      LOAD_TEST_ENVIRONMENT: 'staging',
    })).toThrow(/LOAD_TEST_CONFIRM_HOST/);
    expect(getLoadTestConfig({
      ...remote,
      LOAD_TEST_ALLOW_REMOTE: 'true',
      LOAD_TEST_CONFIRM_HOST: 'project-ref.supabase.co',
      LOAD_TEST_ENVIRONMENT: 'staging',
    }).isLocal).toBe(false);
  });

  it('validates numeric bounds and computes nearest-rank percentiles', () => {
    expect(() => parseInteger('501', 200, 'count', 1, 500)).toThrow(/between 1 and 500/);
    expect(parseInteger(undefined, 0, 'duration', 0, 1800)).toBe(0);
    expect(() => parseInteger('1801', 0, 'duration', 0, 1800)).toThrow(/between 0 and 1800/);
    expect(percentile([20, 10, 40, 30], 95)).toBe(40);
    expect(percentile([], 95)).toBe(0);
  });
});
