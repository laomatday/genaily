// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyContext } from '../lib/familyIdentity';
import type { FamilyData } from '../lib/familyRepository';
import {
  loadFamilyData,
  loadMoreSessionHistory,
  saveScheduleSetup,
  subscribeToChildChanges,
} from '../lib/familyRepository';
import { useFamilyData, type FamilyDataAccessScope } from './useFamilyData';

vi.mock('../lib/familyRepository', () => ({
  applySmartWeek: vi.fn(),
  approveLearningSession: vi.fn(),
  clearChildData: vi.fn(),
  createDevicePairing: vi.fn(),
  createLearningGoal: vi.fn(),
  generateSmartWeek: vi.fn(),
  loadFamilyData: vi.fn(),
  loadMoreSessionHistory: vi.fn(),
  markNotificationRead: vi.fn(),
  redeemChildMilestone: vi.fn(),
  removeChildAvatar: vi.fn(),
  revokeManagedDevice: vi.fn(),
  saveChildMilestone: vi.fn(),
  saveScheduleSetup: vi.fn(),
  saveSessionNote: vi.fn(),
  sendParentMessage: vi.fn(),
  startLearningSession: vi.fn(),
  submitLearningSession: vi.fn(),
  subscribeToChildChanges: vi.fn(() => vi.fn()),
  updateChildProfile: vi.fn(),
  uploadChildAvatar: vi.fn(),
  uploadSessionEvidence: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const parentProfileId = '10000000-0000-4000-8000-000000000001';
const firstContext: FamilyContext = {
  familyId: '10000000-0000-4000-8000-000000000010',
  parentProfileId,
  childProfileId: '10000000-0000-4000-8000-000000000011',
};
const secondContext: FamilyContext = {
  familyId: '10000000-0000-4000-8000-000000000010',
  parentProfileId,
  childProfileId: '10000000-0000-4000-8000-000000000012',
};

function familyData(childId: string): FamilyData {
  return {
    child: { id: childId },
    scheduleVersion: '0123456789abcdef0123456789abcdef',
  } as FamilyData;
}

describe('useFamilyData child context isolation', () => {
  it('never exposes the previous child while a new child is loading', async () => {
    const firstData = familyData(firstContext.childProfileId);
    let resolveSecond!: (data: FamilyData) => void;
    const secondRequest = new Promise<FamilyData>((resolve) => {
      resolveSecond = resolve;
    });
    vi.mocked(loadFamilyData)
      .mockResolvedValueOnce(firstData)
      .mockReturnValueOnce(secondRequest);
    vi.mocked(subscribeToChildChanges).mockReturnValue(vi.fn());

    const renderedChildIds: Array<string | null> = [];
    function Probe({ context, accessScope = 'parent' }: {
      context: FamilyContext;
      accessScope?: FamilyDataAccessScope;
    }) {
      const state = useFamilyData(context, accessScope);
      const childId = state.data?.child.id ?? null;
      renderedChildIds.push(childId);
      return <span>{childId ?? (state.loading ? 'loading' : 'empty')}</span>;
    }

    const view = render(<Probe context={firstContext} />);
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());
    const renderCountBeforeSwitch = renderedChildIds.length;

    view.rerender(<Probe context={secondContext} />);

    expect(renderedChildIds.slice(renderCountBeforeSwitch)).not.toContain(firstContext.childProfileId);
    expect(screen.getByText('loading')).toBeTruthy();

    resolveSecond(familyData(secondContext.childProfileId));
    await waitFor(() => expect(screen.getByText(secondContext.childProfileId)).toBeTruthy());
  });

  it('does not reuse parent-loaded data after entering child scope for the same profile', async () => {
    const parentData = familyData(firstContext.childProfileId);
    let resolveChild!: (data: FamilyData) => void;
    const childRequest = new Promise<FamilyData>((resolve) => {
      resolveChild = resolve;
    });
    vi.mocked(loadFamilyData)
      .mockResolvedValueOnce(parentData)
      .mockReturnValueOnce(childRequest);
    vi.mocked(subscribeToChildChanges).mockReturnValue(vi.fn());

    const renderedChildIds: Array<string | null> = [];
    function Probe({ accessScope }: { accessScope: FamilyDataAccessScope }) {
      const state = useFamilyData(firstContext, accessScope);
      const childId = state.data?.child.id ?? null;
      renderedChildIds.push(childId);
      return <span>{childId ?? (state.loading ? 'loading' : 'empty')}</span>;
    }

    const view = render(<Probe accessScope="parent" />);
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());
    const renderCountBeforeSwitch = renderedChildIds.length;

    view.rerender(<Probe accessScope="child" />);

    expect(renderedChildIds.slice(renderCountBeforeSwitch)).not.toContain(firstContext.childProfileId);
    expect(screen.getByText('loading')).toBeTruthy();

    resolveChild(familyData(firstContext.childProfileId));
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());
  });

  it('does not let a completed mutation for the previous child invalidate the active child request', async () => {
    let resolveSave!: () => void;
    let resolveSecondLoad!: (data: FamilyData) => void;
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const pendingSecondLoad = new Promise<FamilyData>((resolve) => {
      resolveSecondLoad = resolve;
    });
    vi.mocked(loadFamilyData)
      .mockResolvedValueOnce(familyData(firstContext.childProfileId))
      .mockReturnValueOnce(pendingSecondLoad)
      .mockResolvedValue(familyData(firstContext.childProfileId));
    vi.mocked(saveScheduleSetup).mockReturnValueOnce(pendingSave);
    vi.mocked(subscribeToChildChanges).mockReturnValue(vi.fn());

    function Probe({ context }: { context: FamilyContext }) {
      const state = useFamilyData(context, 'parent');
      return (
        <div>
          <span>{state.data?.child.id ?? (state.loading ? 'loading' : 'empty')}</span>
          <button type="button" onClick={() => void state.saveSchedule([], state.data?.scheduleVersion ?? '').catch(() => undefined)}>
            Lưu
          </button>
        </div>
      );
    }

    const view = render(<Probe context={firstContext} />);
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(saveScheduleSetup).toHaveBeenCalledWith(
      firstContext,
      [],
      '0123456789abcdef0123456789abcdef',
    );

    view.rerender(<Probe context={secondContext} />);
    await waitFor(() => expect(loadFamilyData).toHaveBeenCalledWith(secondContext));
    expect(screen.getByText('loading')).toBeTruthy();

    await act(async () => {
      resolveSave();
      await pendingSave;
    });
    expect(loadFamilyData).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecondLoad(familyData(secondContext.childProfileId));
      await pendingSecondLoad;
    });
    await waitFor(() => expect(screen.getByText(secondContext.childProfileId)).toBeTruthy());
    expect(screen.queryByText(firstContext.childProfileId)).toBeNull();
  });

  it('coalesces an invalidation burst into one trailing refresh', async () => {
    let resolveInitial!: (data: FamilyData) => void;
    let resolveTrailing!: (data: FamilyData) => void;
    const initialRequest = new Promise<FamilyData>((resolve) => {
      resolveInitial = resolve;
    });
    const trailingRequest = new Promise<FamilyData>((resolve) => {
      resolveTrailing = resolve;
    });
    vi.mocked(loadFamilyData)
      .mockReturnValueOnce(initialRequest)
      .mockReturnValueOnce(trailingRequest);
    vi.mocked(subscribeToChildChanges).mockReturnValue(vi.fn());

    function Probe() {
      const state = useFamilyData(firstContext, 'parent');
      return <span>{state.data?.child.id ?? (state.loading ? 'loading' : 'empty')}</span>;
    }

    render(<Probe />);
    await waitFor(() => expect(loadFamilyData).toHaveBeenCalledTimes(1));
    const invalidate = vi.mocked(subscribeToChildChanges).mock.calls[0]?.[1];
    expect(invalidate).toBeTypeOf('function');

    act(() => {
      invalidate?.();
      invalidate?.();
      invalidate?.();
    });
    expect(loadFamilyData).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInitial(familyData(firstContext.childProfileId));
      await initialRequest;
    });
    await waitFor(() => expect(loadFamilyData).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveTrailing(familyData(firstContext.childProfileId));
      await trailingRequest;
    });
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());
    expect(loadFamilyData).toHaveBeenCalledTimes(2);
  });

  it('finishes loading when StrictMode restarts the subscription effect', async () => {
    let resolveInitial!: (data: FamilyData) => void;
    let resolveTrailing!: (data: FamilyData) => void;
    const initialRequest = new Promise<FamilyData>((resolve) => {
      resolveInitial = resolve;
    });
    const trailingRequest = new Promise<FamilyData>((resolve) => {
      resolveTrailing = resolve;
    });
    vi.mocked(loadFamilyData)
      .mockReturnValueOnce(initialRequest)
      .mockReturnValueOnce(trailingRequest);

    function Probe() {
      const state = useFamilyData(firstContext, 'parent');
      return <span>{state.data?.child.id ?? (state.loading ? 'loading' : 'empty')}</span>;
    }

    render(<StrictMode><Probe /></StrictMode>);
    await waitFor(() => expect(loadFamilyData).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveInitial(familyData(firstContext.childProfileId));
      await initialRequest;
    });
    await waitFor(() => expect(loadFamilyData).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveTrailing(familyData(firstContext.childProfileId));
      await trailingRequest;
    });
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());
  });

  it('ignores a load-more failure from the previously selected child', async () => {
    const firstData = {
      ...familyData(firstContext.childProfileId),
      sessions: [],
      tasks: [],
      answers: [],
      sessionEvents: [],
      sessionPage: {
        cursor: {
          startsAt: '2026-09-01T00:00:00.000Z',
          id: '30000000-0000-4000-8000-000000000001',
        },
        hasMore: true,
      },
    } as FamilyData;
    let rejectOldPage!: (cause: Error) => void;
    const oldPageRequest = new Promise<never>((_resolve, reject) => {
      rejectOldPage = reject;
    });
    vi.mocked(loadFamilyData)
      .mockResolvedValueOnce(firstData)
      .mockResolvedValueOnce(familyData(secondContext.childProfileId));
    vi.mocked(loadMoreSessionHistory).mockReturnValueOnce(oldPageRequest);

    function Probe({ context }: { context: FamilyContext }) {
      const state = useFamilyData(context, 'parent');
      return (
        <div>
          <span>{state.data?.child.id ?? (state.loading ? 'loading' : 'empty')}</span>
          <span data-testid="family-error">{state.error ?? 'no-error'}</span>
          <button type="button" onClick={() => void state.loadMoreSessions()}>Tải thêm</button>
        </div>
      );
    }

    const view = render(<Probe context={firstContext} />);
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    expect(loadMoreSessionHistory).toHaveBeenCalledTimes(1);

    view.rerender(<Probe context={secondContext} />);
    await waitFor(() => expect(screen.getByText(secondContext.childProfileId)).toBeTruthy());
    await act(async () => {
      rejectOldPage(new Error('Lỗi trang cũ'));
      await oldPageRequest.catch(() => undefined);
    });

    expect(screen.getByTestId('family-error').textContent).toBe('no-error');
  });

  it('releases load-more state when a same-child refresh supersedes its page', async () => {
    const firstData = {
      ...familyData(firstContext.childProfileId),
      sessions: [],
      tasks: [],
      answers: [],
      sessionEvents: [],
      sessionPage: {
        cursor: {
          startsAt: '2026-09-01T00:00:00.000Z',
          id: '30000000-0000-4000-8000-000000000001',
        },
        hasMore: true,
      },
    } as FamilyData;
    let rejectOldPage!: (cause: Error) => void;
    const oldPageRequest = new Promise<never>((_resolve, reject) => {
      rejectOldPage = reject;
    });
    vi.mocked(loadFamilyData)
      .mockResolvedValueOnce(firstData)
      .mockResolvedValueOnce(firstData);
    vi.mocked(loadMoreSessionHistory).mockReturnValueOnce(oldPageRequest);

    function Probe() {
      const state = useFamilyData(firstContext, 'parent');
      return (
        <div>
          <span>{state.data?.child.id ?? (state.loading ? 'loading' : 'empty')}</span>
          <span data-testid="page-state">{state.loadingMore ? 'page-loading' : 'page-idle'}</span>
          <button type="button" onClick={() => void state.loadMoreSessions()}>Tải thêm</button>
        </div>
      );
    }

    render(<Probe />);
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(screen.getByTestId('page-state').textContent).toBe('page-loading'));

    const invalidate = vi.mocked(subscribeToChildChanges).mock.calls[0]?.[1];
    act(() => invalidate?.());
    await waitFor(() => expect(loadFamilyData).toHaveBeenCalledTimes(2));

    await act(async () => {
      rejectOldPage(new Error('Trang đã cũ'));
      await oldPageRequest.catch(() => undefined);
    });
    expect(screen.getByTestId('page-state').textContent).toBe('page-idle');
  });

  it('keeps saving true until every concurrent mutation for the child settles', async () => {
    let resolveFirstSave!: () => void;
    let resolveSecondSave!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    const secondSave = new Promise<void>((resolve) => {
      resolveSecondSave = resolve;
    });
    const currentData = familyData(firstContext.childProfileId);
    vi.mocked(loadFamilyData).mockResolvedValue(currentData);
    vi.mocked(saveScheduleSetup)
      .mockReturnValueOnce(firstSave)
      .mockReturnValueOnce(secondSave);

    function Probe() {
      const state = useFamilyData(firstContext, 'parent');
      return (
        <div>
          <span>{state.data?.child.id ?? (state.loading ? 'loading' : 'empty')}</span>
          <span data-testid="saving-state">{state.saving ? 'saving' : 'idle'}</span>
          <button type="button" onClick={() => void state.saveSchedule([], state.data?.scheduleVersion ?? '')}>Lưu một</button>
          <button type="button" onClick={() => void state.saveSchedule([], state.data?.scheduleVersion ?? '')}>Lưu hai</button>
        </div>
      );
    }

    render(<Probe />);
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Lưu một' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu hai' }));
    expect(saveScheduleSetup).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('saving-state').textContent).toBe('saving'));

    await act(async () => {
      resolveFirstSave();
      await firstSave;
    });
    await waitFor(() => expect(loadFamilyData).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('saving-state').textContent).toBe('saving');

    await act(async () => {
      resolveSecondSave();
      await secondSave;
    });
    await waitFor(() => expect(screen.getByTestId('saving-state').textContent).toBe('idle'));
  });
});
