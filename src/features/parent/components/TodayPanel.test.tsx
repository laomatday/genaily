// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { formatLocalDateKey, getDayKey } from '../../../lib/date';
import type { FamilyData, LearningSessionRow } from '../../../lib/familyRepository';
import { TodayPanel } from './TodayPanel';

function session(id: string, subject: string): LearningSessionRow {
  return {
    id,
    family_id: 'family-1',
    child_profile_id: 'child-1',
    goal_id: null,
    schedule_event_id: `event-${id}`,
    schedule_occurrence_id: `occurrence-${id}`,
    subject,
    title: subject,
    starts_at: new Date().toISOString(),
    actual_started_at: new Date().toISOString(),
    ends_at: null,
    duration_minutes: 45,
    status: 'awaiting_parent',
    approval_policy: 'parent_required',
    awarded_points: 0,
    child_note: null,
    evidence_url: null,
    focus_score: null,
    notes: null,
    quick_check_score: 1,
    quick_check_total: 1,
    reflection: 'ok',
    tasks_done: 1,
    tasks_total: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function familyData(sessions: LearningSessionRow[]): FamilyData {
  return {
    parent: { id: 'parent-1', full_name: 'Ba', avatar_url: null, role: 'parent', grade_level: null, experience_points: 0 },
    child: { id: 'child-1', full_name: 'Khang', avatar_url: null, role: 'child', grade_level: 5, experience_points: 120 },
    goals: [],
    sessions,
    schedule: [{
      id: 'event-1',
      family_id: 'family-1',
      child_profile_id: 'child-1',
      title: 'Toán',
      subject: 'Toán',
      day_of_week: getDayKey(),
      start_time: '08:00:00',
      duration_minutes: 45,
      event_type: 'school',
      status: 'upcoming',
      sort_order: 0,
      study_lock_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }],
    occurrences: [{
      id: 'occurrence-1',
      family_id: 'family-1',
      child_profile_id: 'child-1',
      schedule_event_id: 'event-1',
      occurrence_date: formatLocalDateKey(),
      starts_at: new Date().toISOString(),
      ends_at: new Date().toISOString(),
      event_type: 'school',
      status: 'completed',
      study_lock_enabled: true,
      subject: 'Toán',
      title: 'Toán',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }],
    exceptions: [],
    settings: null,
    aiPlan: null,
    tasks: sessions.map((item) => ({
      id: `task-${item.id}`,
      session_id: item.id,
      title: `Bài ${item.subject}`,
      is_done: true,
      sort_order: 0,
      created_at: new Date().toISOString(),
    })),
    questions: [],
    answers: [],
    deviceCommands: [],
    managedDevices: [],
    deviceCommandDeliveries: [],
    milestones: [],
    notifications: [],
    sessionEvents: [],
    subjectSuggestions: [],
    sessionPage: { hasMore: false, cursor: null },
  } as FamilyData;
}

describe('TodayPanel integration', () => {
  it('shows real daily progress and approves the selected pending session', async () => {
    const user = userEvent.setup();
    const sessions = [session('one', 'Toán'), session('two', 'Tiếng Anh')];
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <TodayPanel
        data={familyData(sessions)}
        session={sessions[0]}
        saving={false}
        onApprove={onApprove}
        onOpenDetails={vi.fn()}
        onSelectEvent={vi.fn()}
        onSwitchToChild={vi.fn().mockResolvedValue(undefined)}
        onOpenDevices={vi.fn()}
        onOpenSetup={vi.fn()}
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'Tiến độ hôm nay 100%' })).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Chờ phụ huynh duyệt' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Duyệt & thưởng/ })).toHaveLength(2);
    const englishCard = screen.getByText('Tiếng Anh').closest('article');
    expect(englishCard).not.toBeNull();
    await user.click(within(englishCard!).getByRole('button', { name: /Duyệt & thưởng/ }));
    expect(onApprove).toHaveBeenCalledWith(sessions[1]);
  });
});
