export interface AiRuntimeConfig {
  maxConcurrency: number;
  leaseTtlSeconds: number;
  requestTimeoutMs: number;
  retryAfterSeconds: number;
}

export const AI_RUNTIME_DEFAULTS: Readonly<AiRuntimeConfig> = Object.freeze({
  maxConcurrency: 4,
  leaseTtlSeconds: 90,
  requestTimeoutMs: 45_000,
  retryAfterSeconds: 10,
});

const AI_RUNTIME_LIMITS = Object.freeze({
  maxConcurrency: { min: 1, max: 16 },
  leaseTtlSeconds: { min: 30, max: 300 },
  requestTimeoutMs: { min: 5_000, max: 120_000 },
  retryAfterSeconds: { min: 1, max: 60 },
  leaseReleaseBufferMs: 10_000,
});

export type AiRuntimeEnvReader = (name: string) => string | undefined;

const AI_TIMEOUT_CODES = new Set([
  'ABORT_ERR',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);

function boundedInteger(
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const normalized = rawValue?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) return fallback;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function resolveAiRuntimeConfig(readEnv: AiRuntimeEnvReader): AiRuntimeConfig {
  const maxConcurrency = boundedInteger(
    readEnv('AI_GENERATION_MAX_CONCURRENCY'),
    AI_RUNTIME_DEFAULTS.maxConcurrency,
    AI_RUNTIME_LIMITS.maxConcurrency.min,
    AI_RUNTIME_LIMITS.maxConcurrency.max,
  );
  const leaseTtlSeconds = boundedInteger(
    readEnv('AI_GENERATION_LEASE_TTL_SECONDS'),
    AI_RUNTIME_DEFAULTS.leaseTtlSeconds,
    AI_RUNTIME_LIMITS.leaseTtlSeconds.min,
    AI_RUNTIME_LIMITS.leaseTtlSeconds.max,
  );
  const configuredTimeoutMs = boundedInteger(
    readEnv('GEMINI_REQUEST_TIMEOUT_MS'),
    AI_RUNTIME_DEFAULTS.requestTimeoutMs,
    AI_RUNTIME_LIMITS.requestTimeoutMs.min,
    AI_RUNTIME_LIMITS.requestTimeoutMs.max,
  );
  const maximumTimeoutForLease = Math.max(
    AI_RUNTIME_LIMITS.requestTimeoutMs.min,
    leaseTtlSeconds * 1_000 - AI_RUNTIME_LIMITS.leaseReleaseBufferMs,
  );
  const requestTimeoutMs = Math.min(configuredTimeoutMs, maximumTimeoutForLease);
  const retryAfterSeconds = boundedInteger(
    readEnv('AI_GENERATION_RETRY_AFTER_SECONDS'),
    AI_RUNTIME_DEFAULTS.retryAfterSeconds,
    AI_RUNTIME_LIMITS.retryAfterSeconds.min,
    AI_RUNTIME_LIMITS.retryAfterSeconds.max,
  );

  return {
    maxConcurrency,
    leaseTtlSeconds,
    requestTimeoutMs,
    retryAfterSeconds,
  };
}

function errorField(error: unknown, field: string): unknown {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

/** Recognize the timeout/abort shapes used by fetch and the Google GenAI SDK. */
export function isAiRequestTimeout(error: unknown): boolean {
  const name = errorField(error, 'name');
  const code = errorField(error, 'code');
  if (name === 'AbortError' || (typeof code === 'string' && AI_TIMEOUT_CODES.has(code))) {
    return true;
  }

  const message = errorField(error, 'message');
  if (typeof message === 'string' && /tim(?:e|ed)\s*out|timeout|deadline exceeded/i.test(message)) {
    return true;
  }

  const cause = errorField(error, 'cause');
  return cause !== undefined && cause !== error && isAiRequestTimeout(cause);
}
