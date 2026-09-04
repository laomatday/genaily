// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import {
  getDeviceSetupStorageKey,
  loadPersistedFamilyContext,
  persistFamilyContext,
  serializeDeviceSetup,
  type FamilyContext,
} from './lib/familyIdentity';
import App from './App';

const state = vi.hoisted(() => ({
  authLoading: true,
  authUser: null as User | null,
  contextIds: [] as Array<string | null>,
  getServerAppMode: vi.fn(),
  getAppOnboardingStatus: vi.fn(),
  signOut: vi.fn(),
}));

const parentId = '10000000-0000-4000-8000-000000000001';
const firstChildId = '10000000-0000-4000-8000-000000000011';
const secondChildId = '10000000-0000-4000-8000-000000000012';
const familyId = '10000000-0000-4000-8000-000000000010';
const secondContext: FamilyContext = {
  familyId,
  parentProfileId: parentId,
  childProfileId: secondChildId,
};

const children = [
  {
    account_space_id: familyId,
    parent_profile_id: parentId,
    child_profile_id: firstChildId,
    child_name: 'Bé Một',
    child_avatar_url: null,
    child_grade_level: 3,
    child_joined_at: '2026-09-01T00:00:00.000Z',
  },
  {
    account_space_id: familyId,
    parent_profile_id: parentId,
    child_profile_id: secondChildId,
    child_name: 'Bé Hai',
    child_avatar_url: null,
    child_grade_level: 5,
    child_joined_at: '2026-09-02T00:00:00.000Z',
  },
];

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: state.authUser,
    loading: state.authLoading,
    isConfigured: true,
    signUp: vi.fn(),
    signIn: vi.fn(),
    verifyPassword: vi.fn(),
    signOut: state.signOut,
  }),
}));

vi.mock('./hooks/useAccountChildren', () => ({
  contextFromAccountChild: (child: (typeof children)[number]) => ({
    familyId: child.account_space_id,
    parentProfileId: child.parent_profile_id,
    childProfileId: child.child_profile_id,
  }),
  useAccountChildren: (user: User | null) => ({
    children: user ? children : [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    addChild: vi.fn(),
  }),
}));

vi.mock('./hooks/useFamilyData', () => ({
  useFamilyData: (context: FamilyContext | null) => {
    state.contextIds.push(context?.childProfileId ?? null);
    return {
      data: context ? { child: { id: context.childProfileId }, sessions: [], aiPlan: null } : null,
      loading: false,
      saving: false,
      loadingMore: false,
      error: null,
      approveSession: vi.fn(),
      addGoal: vi.fn(),
      saveSchedule: vi.fn(),
      generateWeek: vi.fn(),
      applyWeek: vi.fn(),
      loadMoreSessions: vi.fn(),
      refresh: vi.fn(),
      markNotificationRead: vi.fn(),
      saveMilestone: vi.fn(),
      createDevicePairing: vi.fn(),
      revokeDevice: vi.fn(),
      updateProfile: vi.fn(),
      clearAllData: vi.fn(),
      startSession: vi.fn(),
      requestBreak: vi.fn(),
      saveNote: vi.fn(),
      sendParentMessage: vi.fn(),
      redeemMilestone: vi.fn(),
      submitSession: vi.fn(),
      uploadEvidence: vi.fn(),
    };
  },
}));

vi.mock('./lib/familyRepository', () => ({
  completeAppOnboarding: vi.fn(),
  enterChildMode: vi.fn(),
  getAppOnboardingStatus: state.getAppOnboardingStatus,
  getServerAppMode: state.getServerAppMode,
}));

vi.mock('./features/parent/ParentDashboard', () => ({
  ParentDashboard: ({ selectedChildId }: { selectedChildId: string }) => (
    <div data-testid="selected-child-id">{selectedChildId}</div>
  ),
}));

vi.mock('./features/child/ChildApp', () => ({
  ChildApp: () => <div>Child app</div>,
}));

beforeEach(() => {
  localStorage.clear();
  state.authLoading = true;
  state.authUser = null;
  state.contextIds.length = 0;
  state.getServerAppMode.mockReset().mockResolvedValue({
    appMode: 'parent',
    familyId: null,
    childProfileId: null,
  });
  state.getAppOnboardingStatus.mockReset().mockResolvedValue(true);
  state.signOut.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App selected child restoration', () => {
  it('keeps the second child through auth bootstrap and a focus mode recheck', async () => {
    persistFamilyContext(parentId, secondContext);
    localStorage.setItem(
      getDeviceSetupStorageKey(parentId),
      serializeDeviceSetup(parentId, 'parent'),
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const view = render(<App />);
    expect(screen.getByText('Đang kiểm tra đăng nhập…')).toBeTruthy();

    state.authUser = {
      id: parentId,
      email: 'parent@example.test',
      user_metadata: { full_name: 'Phụ huynh' },
    } as unknown as User;
    state.authLoading = false;
    view.rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('selected-child-id').textContent).toBe(secondChildId);
    });
    expect(state.contextIds).not.toContain(firstChildId);
    expect(loadPersistedFamilyContext(parentId)?.childProfileId).toBe(secondChildId);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(state.getServerAppMode).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.getByTestId('selected-child-id').textContent).toBe(secondChildId);
    });
    expect(state.contextIds).not.toContain(firstChildId);
  });
});
