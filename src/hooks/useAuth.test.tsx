// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import { useAuth } from './useAuth';

const authMock = vi.hoisted(() => ({
  callback: null as ((event: string, session: Session | null) => void) | null,
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: authMock.getSession,
      onAuthStateChange: authMock.onAuthStateChange,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
    },
  },
}));

function user(id: string, email: string): User {
  return { id, email, user_metadata: {} } as unknown as User;
}

beforeEach(() => {
  authMock.callback = null;
  authMock.getSession.mockReset();
  authMock.onAuthStateChange.mockReset().mockImplementation((callback) => {
    authMock.callback = callback;
    return { data: { subscription: { unsubscribe: authMock.unsubscribe } } };
  });
  authMock.unsubscribe.mockReset();
});

describe('useAuth session ordering', () => {
  it('does not restore an old bootstrap session after a newer auth event', async () => {
    const accountA = user('10000000-0000-4000-8000-000000000001', 'a@example.test');
    const accountB = user('20000000-0000-4000-8000-000000000001', 'b@example.test');
    let resolveBootstrap!: (result: {
      data: { session: Session };
      error: null;
    }) => void;
    authMock.getSession.mockReturnValue(new Promise((resolve) => {
      resolveBootstrap = resolve;
    }));

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(authMock.callback).not.toBeNull());

    act(() => {
      authMock.callback?.('SIGNED_IN', { user: accountB } as Session);
    });
    expect(result.current.user?.id).toBe(accountB.id);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveBootstrap({ data: { session: { user: accountA } as Session }, error: null });
      await Promise.resolve();
    });

    expect(result.current.user?.id).toBe(accountB.id);
    expect(result.current.loading).toBe(false);
  });
});
