import type { SessionStatus } from '../types';

export const VALID_TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_parent', 'approved', 'cancelled'],
  awaiting_parent: ['approved', 'rejected', 'cancelled'],
  rejected: ['in_progress', 'cancelled'],
  approved: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransition(current: SessionStatus, next: SessionStatus): boolean {
  return VALID_TRANSITIONS[current].includes(next);
}

export function assertTransition(current: SessionStatus, next: SessionStatus): void {
  if (!canTransition(current, next)) {
    throw new Error(`Không thể chuyển buổi học từ ${current} sang ${next}.`);
  }
}
