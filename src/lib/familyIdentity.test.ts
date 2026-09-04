import { describe, expect, it } from 'vitest';
import {
  getDeviceSetupStorageKey,
  isAccountDataStorageKey,
  isFamilyContext,
  isUuid,
  parseDeviceSetup,
  parseFamilyContext,
  resolveAppEntryDecision,
  serializeDeviceSetup,
  serializeFamilyContext,
} from './familyIdentity';

const context = {
  familyId: '11111111-1111-4111-8111-111111111111',
  parentProfileId: '22222222-2222-4222-8222-222222222222',
  childProfileId: '33333333-3333-4333-8333-333333333333',
};

describe('family identity', () => {
  it('accepts database UUIDs and rejects legacy synthetic IDs', () => {
    expect(isUuid(context.familyId)).toBe(true);
    expect(isUuid('fam-41bb4e3d')).toBe(false);
    expect(isUuid('child-41bb4e3d')).toBe(false);
  });

  it('loads only complete, valid persisted contexts', () => {
    expect(isFamilyContext(context)).toBe(true);
    const stored = serializeFamilyContext(context, 1_000);
    expect(parseFamilyContext(stored, 1_001)).toEqual(context);
    expect(parseFamilyContext(stored, Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(parseFamilyContext(JSON.stringify(context))).toBeNull();
    expect(parseFamilyContext('{bad json')).toBeNull();
    expect(parseFamilyContext(serializeFamilyContext({ ...context, familyId: 'fam-demo' }, 1_000), 1_001)).toBeNull();
  });

  it('identifies account data that must be removed on logout', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    expect(isAccountDataStorageKey(`genai_account_children_v1_${userId}`, userId)).toBe(true);
    expect(isAccountDataStorageKey('genai_child_store_v1_family_child', userId)).toBe(true);
    expect(isAccountDataStorageKey('genai_family_active_context', userId)).toBe(true);
    expect(isAccountDataStorageKey(getDeviceSetupStorageKey(userId), userId)).toBe(true);
    expect(isAccountDataStorageKey(
      getDeviceSetupStorageKey('22222222-2222-4222-8222-222222222222'),
      userId,
    )).toBe(false);
    expect(isAccountDataStorageKey('genai_app_theme', userId)).toBe(false);
    expect(isAccountDataStorageKey('unrelated', userId)).toBe(false);
  });

  it('loads only a versioned device setup marker for the current account', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    expect(parseDeviceSetup(serializeDeviceSetup(userId, 'parent'), userId)).toEqual({ mode: 'parent' });
    expect(parseDeviceSetup(serializeDeviceSetup(userId, 'child'), userId)).toEqual({ mode: 'child' });
    expect(parseDeviceSetup(serializeDeviceSetup(userId, 'child'), context.parentProfileId)).toBeNull();
    expect(parseDeviceSetup(JSON.stringify({ version: 2, accountId: userId, mode: 'parent' }), userId)).toBeNull();
    expect(parseDeviceSetup(JSON.stringify({ version: 1, accountId: userId, mode: 'admin' }), userId)).toBeNull();
    expect(parseDeviceSetup('{bad json', userId)).toBeNull();
    expect(parseDeviceSetup(serializeDeviceSetup(userId, 'parent'), 'not-a-user-id')).toBeNull();
  });

  it('requires an explicit device and child decision without weakening server child mode', () => {
    expect(resolveAppEntryDecision('parent', true, null)).toBe('choose-mode');
    expect(resolveAppEntryDecision('parent', true, 'child')).toBe('choose-child');
    expect(resolveAppEntryDecision('parent', true, 'parent')).toBe('parent');
    expect(resolveAppEntryDecision('parent', false, 'parent')).toBe('choose-mode');
    expect(resolveAppEntryDecision('child', false, null)).toBe('server-child');
    expect(resolveAppEntryDecision('child', true, 'parent')).toBe('server-child');
  });
});
