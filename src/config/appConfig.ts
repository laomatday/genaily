function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

export const APP_CONFIG = Object.freeze({
  sessionPageSize: positiveInteger(import.meta.env.VITE_SESSION_PAGE_SIZE, 20),
  exceptionPageSize: positiveInteger(import.meta.env.VITE_EXCEPTION_PAGE_SIZE, 20),
  deviceCommandPageSize: positiveInteger(import.meta.env.VITE_DEVICE_COMMAND_PAGE_SIZE, 12),
  deviceDeliveryPageSize: positiveInteger(import.meta.env.VITE_DEVICE_DELIVERY_PAGE_SIZE, 60),
  deviceOnlineWindowMs: positiveInteger(import.meta.env.VITE_DEVICE_ONLINE_WINDOW_SECONDS, 180) * 1000,
  notificationPageSize: positiveInteger(import.meta.env.VITE_NOTIFICATION_PAGE_SIZE, 30),
  milestonePageSize: positiveInteger(import.meta.env.VITE_MILESTONE_PAGE_SIZE, 12),
  defaultRewardPoints: positiveInteger(import.meta.env.VITE_DEFAULT_REWARD_POINTS, 500),
  occurrenceHorizonDays: positiveInteger(import.meta.env.VITE_OCCURRENCE_HORIZON_DAYS, 8),
  occurrenceQueryLimit: positiveInteger(import.meta.env.VITE_OCCURRENCE_QUERY_LIMIT, 800),
  // Polling is the safe default on Supabase Free: its 200 Realtime connection
  // ceiling has no headroom when 200 accounts are online at once.
  realtimeEnabled: booleanValue(import.meta.env.VITE_REALTIME_ENABLED, false),
  realtimeDebounceMs: positiveInteger(import.meta.env.VITE_REALTIME_DEBOUNCE_MS, 180),
  realtimeFallbackPollMs: positiveInteger(import.meta.env.VITE_REALTIME_FALLBACK_POLL_SECONDS, 30) * 1000,
  deviceClaimLeaseMs: positiveInteger(import.meta.env.VITE_DEVICE_CLAIM_LEASE_MS, 120_000),
  evidenceMaxBytes: positiveInteger(import.meta.env.VITE_EVIDENCE_MAX_BYTES, 10 * 1024 * 1024),
  evidenceSignedUrlSeconds: positiveInteger(import.meta.env.VITE_EVIDENCE_SIGNED_URL_SECONDS, 300),
  childAvatarMaxBytes: positiveInteger(import.meta.env.VITE_CHILD_AVATAR_MAX_BYTES, 3 * 1024 * 1024),
  childAvatarSignedUrlSeconds: positiveInteger(import.meta.env.VITE_CHILD_AVATAR_SIGNED_URL_SECONDS, 3600),
  contextTtlMs: positiveInteger(import.meta.env.VITE_CONTEXT_TTL_HOURS, 168) * 60 * 60 * 1000,
});
