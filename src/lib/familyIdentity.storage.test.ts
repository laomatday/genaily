// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_FAMILY_CONTEXT_STORAGE_KEY,
  getAccountFamilyContextStorageKey,
  loadPersistedFamilyContext,
  persistFamilyContext,
  purgeAccountStorage,
  type FamilyContext,
} from './familyIdentity';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const secondChildContext: FamilyContext = {
  familyId: '33333333-3333-4333-8333-333333333333',
  parentProfileId: userId,
  childProfileId: '44444444-4444-4444-8444-444444444444',
};

beforeEach(() => localStorage.clear());

describe('persisted family context', () => {
  it('restores the exact selected child for the matching account', () => {
    persistFamilyContext(userId, secondChildContext, 1_000);

    expect(loadPersistedFamilyContext(userId, 1_001)).toEqual(secondChildContext);
    expect(loadPersistedFamilyContext(undefined, 1_001)).toEqual(secondChildContext);
    expect(loadPersistedFamilyContext(otherUserId, 1_001)).toBeNull();
  });

  it('expires and purges account-scoped selection on logout', () => {
    persistFamilyContext(userId, secondChildContext, 1_000);
    expect(loadPersistedFamilyContext(userId, Number.MAX_SAFE_INTEGER)).toBeNull();

    purgeAccountStorage(userId);
    expect(localStorage.getItem(getAccountFamilyContextStorageKey(userId))).toBeNull();
    expect(localStorage.getItem(ACTIVE_FAMILY_CONTEXT_STORAGE_KEY)).toBeNull();
  });
});
