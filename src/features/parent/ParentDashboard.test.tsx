// @vitest-environment jsdom
import { useState, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyData } from '../../lib/familyRepository';
import { ParentDashboard } from './ParentDashboard';

vi.mock('./components/TodayPanel', () => ({
  TodayPanel: ({ onOpenSetup }: { onOpenSetup: () => void }) => (
    <button type="button" onClick={onOpenSetup}>Mở thiết lập lịch</button>
  ),
}));

vi.mock('./components/ScheduleSetupPanel', () => ({
  ScheduleSetupPanel: ({ data }: { data: FamilyData }) => {
    // Models the panel's lazy draft initialization. A child change must remount
    // it or this owner remains the previous child.
    const [draftOwner] = useState(data.child.id);
    return <div data-testid="schedule-draft-owner">{draftOwner}</div>;
  },
}));

vi.mock('../../components/AppSidebar', () => ({ AppSidebar: () => null }));
vi.mock('../../components/ChildProfileSheet', () => ({ ChildProfileSheet: () => null }));

afterEach(cleanup);

function makeData(childId: string, childName: string): FamilyData {
  return {
    child: { id: childId, full_name: childName, grade_level: 5, avatar_url: null },
    parent: { avatar_url: null },
    sessions: [],
    notifications: [],
    milestones: [],
  } as FamilyData;
}

function makeProps(data: FamilyData): ComponentProps<typeof ParentDashboard> {
  return {
    data,
    accountName: 'Phụ huynh',
    accountEmail: 'parent@example.test',
    children: [],
    childrenError: null,
    selectedChildId: data.child.id,
    saving: false,
    loadingMore: false,
    error: null,
    onApprove: vi.fn(),
    onAddGoal: vi.fn(),
    onSaveSchedule: vi.fn(),
    onGenerateWeek: vi.fn(),
    onApplyWeek: vi.fn(),
    onLoadMoreSessions: vi.fn(),
    onRefresh: vi.fn(),
    onMarkNotificationRead: vi.fn(),
    onSaveMilestone: vi.fn(),
    onCreateDevicePairing: vi.fn(),
    onRevokeDevice: vi.fn(),
    onUpdateProfile: vi.fn(),
    onAddChild: vi.fn(),
    onSelectChild: vi.fn(),
    onClearData: vi.fn(),
    onSwitchToChild: vi.fn(),
    onLogout: vi.fn(),
  };
}

describe('ParentDashboard schedule editor isolation', () => {
  it('remounts schedule drafts when the selected child changes', () => {
    const firstData = makeData('10000000-0000-4000-8000-000000000011', 'Bé Một');
    const secondData = makeData('10000000-0000-4000-8000-000000000012', 'Bé Hai');
    const view = render(<ParentDashboard {...makeProps(firstData)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mở thiết lập lịch' }));
    expect(screen.getByTestId('schedule-draft-owner').textContent).toBe(firstData.child.id);

    view.rerender(<ParentDashboard {...makeProps(secondData)} />);
    expect(screen.getByTestId('schedule-draft-owner').textContent).toBe(secondData.child.id);
  });
});
