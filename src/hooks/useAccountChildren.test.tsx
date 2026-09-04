// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadChildAvatar } from '../lib/familyRepository.mutations';
import { supabase } from '../lib/supabase';
import { useAccountChildren, type AccountChild } from './useAccountChildren';

vi.mock('../lib/familyRepository.mutations', () => ({
  uploadChildAvatar: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));

const parentProfileId = '10000000-0000-4000-8000-000000000001';
const accountSpaceId = '10000000-0000-4000-8000-000000000010';
const childProfileId = '10000000-0000-4000-8000-000000000011';
const avatarPath = `${accountSpaceId}/${childProfileId}/10000000-0000-4000-8000-000000000012.webp`;

const createdChild: AccountChild = {
  account_space_id: accountSpaceId,
  parent_profile_id: parentProfileId,
  child_profile_id: childProfileId,
  child_name: 'Lan',
  child_avatar_url: null,
  child_grade_level: 4,
  child_joined_at: '2026-09-04T00:00:00.000Z',
};

function successfulRpc<T>(data: T) {
  return {
    data,
    error: null,
    count: null,
    status: 200,
    statusText: 'OK',
    success: true as const,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(supabase.rpc).mockReset();
  vi.mocked(uploadChildAvatar).mockReset();
});

afterEach(cleanup);

describe('useAccountChildren avatar upload', () => {
  it('uploads an added child avatar with the newly-created child context and returns its path', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce(successfulRpc([]))
      .mockResolvedValueOnce(successfulRpc([createdChild]))
      .mockResolvedValueOnce(successfulRpc([
        { ...createdChild, child_avatar_url: avatarPath },
      ]));
    vi.mocked(uploadChildAvatar).mockResolvedValue(avatarPath);

    const user = { id: parentProfileId } as User;
    const { result } = renderHook(() => useAccountChildren(user));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(['avatar'], 'lan.webp', { type: 'image/webp' });
    let addedChild: AccountChild | undefined;
    await act(async () => {
      addedChild = await result.current.addChild('Lan', 4, file);
    });

    expect(uploadChildAvatar).toHaveBeenCalledWith({
      familyId: accountSpaceId,
      parentProfileId,
      childProfileId,
    }, file);
    expect(addedChild?.child_avatar_url).toBe(avatarPath);
    expect(result.current.children).toEqual([
      expect.objectContaining({
        child_profile_id: childProfileId,
        child_avatar_url: avatarPath,
      }),
    ]);
  });
});
