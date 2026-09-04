import { describe, expect, it } from 'vitest';
import { resolveApprovalPolicy } from './approvalPolicy';
import { calculateDayLoads, parseSmartWeekOutput } from './plannerService';
import { canTransition, assertTransition } from './stateMachine';

describe('learning session state machine', () => {
  it('accepts workflow transitions and rejects skips', () => {
    expect(canTransition('scheduled', 'in_progress')).toBe(true);
    expect(canTransition('scheduled', 'approved')).toBe(false);
    expect(() => assertTransition('awaiting_parent', 'approved')).not.toThrow();
    expect(() => assertTransition('completed', 'in_progress')).toThrow();
  });
});

describe('approval policy', () => {
  it('auto approves only complete passing work', () => {
    expect(resolveApprovalPolicy({
      policy: 'auto_approve',
      tasksDone: 4,
      tasksTotal: 4,
      quickCheckScore: 4,
      quickCheckTotal: 5,
      hasEvidence: false,
    })).toEqual({ status: 'approved', reason: 'auto_policy' });
    expect(resolveApprovalPolicy({
      policy: 'auto_approve',
      tasksDone: 3,
      tasksTotal: 4,
      quickCheckScore: 5,
      quickCheckTotal: 5,
      hasEvidence: false,
    }).status).toBe('awaiting_parent');
  });

  it('requires evidence for the evidence policy', () => {
    const base = {
      policy: 'evidence_required' as const,
      tasksDone: 2,
      tasksTotal: 2,
      quickCheckScore: 1,
      quickCheckTotal: 1,
    };
    expect(resolveApprovalPolicy({ ...base, hasEvidence: false }).reason).toBe('evidence_missing');
    expect(resolveApprovalPolicy({ ...base, hasEvidence: true }).status).toBe('approved');
  });
});

describe('smart week model', () => {
  it('derives load from actual schedule minutes', () => {
    const loads = calculateDayLoads([
      { id: '1', day_of_week: 'mon', duration_minutes: 180, event_type: 'school', start_time: '07:00', status: 'upcoming', subject: null, title: 'School' },
      { id: '2', day_of_week: 'mon', duration_minutes: 600, event_type: 'learning', start_time: '16:00', status: 'upcoming', subject: 'Math', title: 'Practice' },
    ]);
    expect(loads.find((load) => load.day === 'mon')).toMatchObject({ minutes: 780, level: 'heavy' });
    expect(loads.find((load) => load.day === 'tue')).toMatchObject({ minutes: 0, level: 'light' });
  });

  it('validates Gemini schedule output', () => {
    expect(parseSmartWeekOutput({
      summary: 'Cân bằng hơn',
      warnings: [],
      schedule_updates: [{
        title: 'Python',
        subject: 'Python',
        day_of_week: 'sat',
        start_time: '09:00:00',
        duration_minutes: 45,
        event_type: 'learning',
        status: 'upcoming',
      }],
    }).schedule_updates).toHaveLength(1);
    expect(() => parseSmartWeekOutput({ summary: 'bad', warnings: [], schedule_updates: [{ title: '' }] })).toThrow();
  });
});
