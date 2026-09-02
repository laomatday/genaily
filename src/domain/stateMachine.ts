import { SessionStatus } from '../types';

export const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  SCHEDULED: ['READY', 'EXPIRED'],
  READY: ['FOCUSING', 'SCHEDULED'],
  FOCUSING: ['COMPLETING', 'SCHEDULED'],
  COMPLETING: ['SUBMITTED'],
  SUBMITTED: ['WAITING_APPROVAL'],
  WAITING_APPROVAL: ['APPROVED', 'EXTENDED', 'REJECTED', 'AUTO_APPROVED', 'EXPIRED'],
  APPROVED: ['UNLOCKED'],
  UNLOCKED: [],
  EXTENDED: ['FOCUSING'],
  REJECTED: ['READY', 'SCHEDULED'],
  AUTO_APPROVED: ['UNLOCKED'],
  EXPIRED: []
};

export function canTransition(current: SessionStatus, next: SessionStatus): boolean {
  const allowed = VALID_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

export function transitionSession(current: SessionStatus, next: SessionStatus): SessionStatus {
  if (canTransition(current, next)) {
    return next;
  }
  throw new Error(`Invalid state transition from ${current} to ${next}`);
}
