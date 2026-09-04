import { describe, expect, it } from 'vitest';
import {
  AI_RUNTIME_DEFAULTS,
  isAiRequestTimeout,
  resolveAiRuntimeConfig,
} from '../../supabase/functions/_shared/ai-runtime';

function envReader(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

describe('AI Edge runtime configuration', () => {
  it('uses conservative defaults when optional secrets are absent', () => {
    expect(resolveAiRuntimeConfig(envReader({}))).toEqual(AI_RUNTIME_DEFAULTS);
  });

  it('accepts bounded integer overrides', () => {
    expect(resolveAiRuntimeConfig(envReader({
      AI_GENERATION_MAX_CONCURRENCY: '8',
      AI_GENERATION_LEASE_TTL_SECONDS: '120',
      GEMINI_REQUEST_TIMEOUT_MS: '60000',
      AI_GENERATION_RETRY_AFTER_SECONDS: '15',
    }))).toEqual({
      maxConcurrency: 8,
      leaseTtlSeconds: 120,
      requestTimeoutMs: 60_000,
      retryAfterSeconds: 15,
    });
  });

  it('falls back safely for malformed or out-of-range values', () => {
    expect(resolveAiRuntimeConfig(envReader({
      AI_GENERATION_MAX_CONCURRENCY: '200',
      AI_GENERATION_LEASE_TTL_SECONDS: '-1',
      GEMINI_REQUEST_TIMEOUT_MS: '45.5',
      AI_GENERATION_RETRY_AFTER_SECONDS: '0',
    }))).toEqual(AI_RUNTIME_DEFAULTS);
  });

  it('keeps the Gemini timeout below the lease TTL recovery boundary', () => {
    const config = resolveAiRuntimeConfig(envReader({
      AI_GENERATION_LEASE_TTL_SECONDS: '30',
      GEMINI_REQUEST_TIMEOUT_MS: '120000',
    }));

    expect(config.leaseTtlSeconds).toBe(30);
    expect(config.requestTimeoutMs).toBe(20_000);
  });

  it('recognizes fetch and provider timeout failures without class coupling', () => {
    expect(isAiRequestTimeout({ name: 'AbortError' })).toBe(true);
    expect(isAiRequestTimeout({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isAiRequestTimeout(new Error('Request timed out after 45000ms'))).toBe(true);
    expect(isAiRequestTimeout({ cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } })).toBe(true);
    expect(isAiRequestTimeout(new Error('Provider returned HTTP 503'))).toBe(false);
  });
});
