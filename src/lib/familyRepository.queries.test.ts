import { describe, expect, it } from 'vitest';
import type { Json } from './database.types';
import type { FamilyContext } from './familyIdentity';
import { parseDashboardSnapshot } from './familyRepository.queries';

const context: FamilyContext = {
  familyId: '10000000-0000-4000-8000-000000000010',
  parentProfileId: '10000000-0000-4000-8000-000000000001',
  childProfileId: '10000000-0000-4000-8000-000000000011',
};

function snapshot(overrides: Record<string, unknown> = {}): Json {
  return {
    ai_plan: null,
    child_milestones: [],
    device_command_deliveries: [],
    device_commands: [],
    exceptions: [],
    family_members: [
      { profile_id: context.parentProfileId, role: 'parent', status: 'active' },
      { profile_id: context.childProfileId, role: 'child', status: 'active' },
    ],
    family_settings: null,
    learning_goals: [],
    learning_sessions: [],
    managed_devices: [],
    notifications: [],
    profiles: [
      { id: context.parentProfileId, role: 'parent' },
      { id: context.childProfileId, role: 'child' },
    ],
    quick_check_answers: [],
    quick_check_questions: [],
    schedule_events: [],
    schedule_occurrences: [],
    schedule_version: 'd41d8cd98f00b204e9800998ecf8427e',
    session_events: [],
    session_tasks: [],
    subject_suggestions: [],
    ...overrides,
  } as Json;
}

describe('parseDashboardSnapshot', () => {
  it('retains an older active session outside the first history page', () => {
    const recent = Array.from({ length: 21 }, (_, index) => ({
      id: `scheduled-${String(index).padStart(2, '0')}`,
      starts_at: new Date(Date.UTC(2026, 8, 30 - index)).toISOString(),
      status: 'scheduled',
    }));
    const active = {
      id: 'active-older-than-page',
      starts_at: '2026-01-01T00:00:00.000Z',
      status: 'in_progress',
    };

    const parsed = parseDashboardSnapshot(snapshot({
      learning_sessions: [...recent, active],
    }), context);

    expect(parsed.sessions.map((session) => session.id)).toContain(active.id);
    expect(parsed.sessionPage.hasMore).toBe(true);
    expect(parsed.sessionPage.cursor?.id).toBe('scheduled-19');
  });

  it('rejects a snapshot without the selected child membership', () => {
    expect(() => parseDashboardSnapshot(snapshot({
      family_members: [
        { profile_id: context.parentProfileId, role: 'parent', status: 'active' },
      ],
    }), context)).toThrow('không có quyền truy cập');
  });

  it('rejects a malformed optimistic schedule version', () => {
    expect(() => parseDashboardSnapshot(snapshot({ schedule_version: '' }), context))
      .toThrow('phiên bản lịch không hợp lệ');
  });
});
