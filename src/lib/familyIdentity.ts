import { APP_CONFIG } from '../config/appConfig';

export interface FamilyContext {
  familyId: string;
  parentProfileId: string;
  childProfileId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const APP_MODE_STORAGE_KEY = 'genai_family_active_mode';
export const DEVICE_SETUP_STORAGE_KEY_PREFIX = 'genai_family_device_setup_';
const FAMILY_CONTEXT_STORAGE_VERSION = 1;
const DEVICE_SETUP_STORAGE_VERSION = 1;

export type DeviceSetupMode = 'parent' | 'child';
export type AppEntryDecision = 'server-child' | 'choose-mode' | 'choose-child' | 'parent';

export interface DeviceSetupMarker {
  mode: DeviceSetupMode;
}

export function resolveAppEntryDecision(
  serverMode: DeviceSetupMode,
  accountOnboardingComplete: boolean,
  deviceSetupMode: DeviceSetupMode | null,
): AppEntryDecision {
  if (serverMode === 'child') return 'server-child';
  if (!accountOnboardingComplete || deviceSetupMode === null) return 'choose-mode';
  if (deviceSetupMode === 'child') return 'choose-child';
  return 'parent';
}

interface StoredFamilyContext {
  version: typeof FAMILY_CONTEXT_STORAGE_VERSION;
  expiresAt: number;
  context: FamilyContext;
}

interface StoredDeviceSetup {
  version: typeof DEVICE_SETUP_STORAGE_VERSION;
  accountId: string;
  mode: DeviceSetupMode;
}

export function getDeviceSetupStorageKey(userId: string): string {
  return `${DEVICE_SETUP_STORAGE_KEY_PREFIX}${userId}`;
}

export function serializeDeviceSetup(userId: string, mode: DeviceSetupMode): string {
  const setup: StoredDeviceSetup = {
    version: DEVICE_SETUP_STORAGE_VERSION,
    accountId: userId,
    mode,
  };
  return JSON.stringify(setup);
}

export function parseDeviceSetup(value: string | null, userId: string): DeviceSetupMarker | null {
  if (!value || !isUuid(userId)) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const setup = parsed as Partial<StoredDeviceSetup>;
    if (setup.version !== DEVICE_SETUP_STORAGE_VERSION) return null;
    if (setup.accountId !== userId) return null;
    if (setup.mode !== 'parent' && setup.mode !== 'child') return null;
    return { mode: setup.mode };
  } catch {
    return null;
  }
}

export function isAccountDataStorageKey(key: string, userId: string): boolean {
  return key === 'genai_family_active_context'
    || key === `genai_family_active_context_${userId}`
    || key === getDeviceSetupStorageKey(userId)
    || key === `genai_account_children_v1_${userId}`
    || key === `genai_user_families_${userId}`
    || key.startsWith('genai_child_store_v1_')
    || key.startsWith('genai_family_store_v2_')
    || key.startsWith('genai_family_store_');
}

export function purgeAccountStorage(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isAccountDataStorageKey(key, userId)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage may be disabled by private browsing or device policy.
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isFamilyContext(value: unknown): value is FamilyContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FamilyContext>;
  return isUuid(candidate.familyId)
    && isUuid(candidate.parentProfileId)
    && isUuid(candidate.childProfileId);
}

export function serializeFamilyContext(
  context: FamilyContext,
  now = Date.now(),
): string {
  const stored: StoredFamilyContext = {
    version: FAMILY_CONTEXT_STORAGE_VERSION,
    expiresAt: now + APP_CONFIG.contextTtlMs,
    context,
  };
  return JSON.stringify(stored);
}

export function parseFamilyContext(value: string | null, now = Date.now()): FamilyContext | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const stored = parsed as Partial<StoredFamilyContext>;
    if (stored.version !== FAMILY_CONTEXT_STORAGE_VERSION) return null;
    if (typeof stored.expiresAt !== 'number' || stored.expiresAt <= now) return null;
    return isFamilyContext(stored.context) ? stored.context : null;
  } catch {
    return null;
  }
}

export function purgeInvalidFamilyStorage(userId: string): void {
  if (typeof window === 'undefined') return;

  const activeKeys = [`genai_family_active_context_${userId}`, 'genai_family_active_context'];
  for (const key of activeKeys) {
    const raw = localStorage.getItem(key);
    if (raw && !parseFamilyContext(raw)) localStorage.removeItem(key);
  }

  const invalidCacheKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key.startsWith('genai_family_store_v2_')) {
      const familyId = key.slice('genai_family_store_v2_'.length);
      if (!isUuid(familyId)) invalidCacheKeys.push(key);
      continue;
    }
    if (key.startsWith('genai_family_store_')) invalidCacheKeys.push(key);
  }
  invalidCacheKeys.forEach((key) => localStorage.removeItem(key));
}
