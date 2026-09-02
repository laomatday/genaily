export type UserRole = 'OWNER_PARENT' | 'PARENT' | 'CHILD' | 'TUTOR' | 'SCHOOL' | 'ADMIN';

export type SessionStatus = 
  | 'SCHEDULED'
  | 'READY'
  | 'FOCUSING'
  | 'COMPLETING'
  | 'SUBMITTED'
  | 'WAITING_APPROVAL'
  | 'APPROVED'
  | 'UNLOCKED'
  | 'EXTENDED'
  | 'REJECTED'
  | 'AUTO_APPROVED'
  | 'EXPIRED';

export interface Child {
  id: string;
  familyId: string;
  name: string;
  avatar: string;
  activeDeviceId: string;
}

export interface LearningSession {
  id: string;
  familyId: string;
  childId: string;
  subject: string;
  title: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: SessionStatus;
  focusMinutes: number;
  completion: {
    tasksDone: number;
    tasksTotal: number;
  };
  reflection?: 'easy' | 'ok' | 'hard';
  approvalPolicy: 'parent_required' | 'auto_approve' | 'evidence_required';
  quickCheckResult?: string;
  evidencePhoto?: string;
}

export interface ScheduleEvent {
  id: string;
  familyId: string;
  childId: string;
  title: string;
  type: 'school' | 'sport' | 'learning' | 'routine' | 'rest';
  startTime: string;
  durationMinutes: number;
  dayOfWeek: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  status: 'completed' | 'live' | 'upcoming';
  subject?: string;
}

export interface ExceptionItem {
  id: string;
  familyId: string;
  childId: string;
  title: string;
  description: string;
  severity: 'low' | 'mid' | 'high';
  createdAt: string;
  status: 'open' | 'resolved';
  recommendedAction: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  familyId: string;
}
