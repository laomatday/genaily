// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyContext } from '../lib/familyIdentity';
import type { FamilyData } from '../lib/familyRepository';
import { loadFamilyData, saveScheduleSetup, subscribeToChildChanges } from '../lib/familyRepository';
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
  return { child: { id: childId } } as FamilyData;
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
          <button type="button" onClick={() => void state.saveSchedule([]).catch(() => undefined)}>
            Lưu
          </button>
        </div>
      );
    }

    const view = render(<Probe context={firstContext} />);
    await waitFor(() => expect(screen.getByText(firstContext.childProfileId)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(saveScheduleSetup).toHaveBeenCalledWith(firstContext, []);

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
});
