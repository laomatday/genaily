import type { MaterialIconName } from './components/MaterialIcon';

export type UserRole = 'parent' | 'child' | 'admin';

export type SessionStatus =
  | 'scheduled'
  | 'in_progress'
  | 'awaiting_parent'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type ApprovalPolicy = 'parent_required' | 'auto_approve' | 'evidence_required';
export type Reflection = 'easy' | 'ok' | 'hard';
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type ScheduleEventType =
  | 'school'
  | 'extra'
  | 'self_study'
  | 'rest'
  | 'sleep'
  | 'sport'
  | 'play'
  | 'other'
  | 'learning'
  | 'routine';
export type ScheduleEventStatus = 'completed' | 'live' | 'upcoming';

export interface ScheduleEventLike {
  id: string;
  day_of_week: DayKey;
  duration_minutes: number;
  event_type: ScheduleEventType;
  start_time: string;
  status: ScheduleEventStatus;
  subject: string | null;
  title: string;
}

export type ActivityCategoryType =
  | 'school'
  | 'extra'
  | 'self_study'
  | 'rest'
  | 'sleep'
  | 'sport'
  | 'play'
  | 'other';

export interface ActivityCategoryMeta {
  type: ActivityCategoryType;
  label: string;
  icon: MaterialIconName;
  description: string;
  bg: string;
  textColor: string;
  borderColor: string;
}

export const ACTIVITY_CATEGORIES: ActivityCategoryMeta[] = [
  {
    type: 'school',
    label: 'Học ở trường',
    icon: 'school',
    description: 'Tiết học chính khóa tại trường',
    bg: 'app-blue-soft',
    textColor: 'app-blue-text',
    borderColor: 'app-blue-border',
  },
  {
    type: 'extra',
    label: 'Học thêm',
    icon: 'co_present',
    description: 'Lớp học thêm hoặc học cùng gia sư',
    bg: 'app-orange-soft',
    textColor: 'app-orange-text',
    borderColor: 'app-orange-border',
  },
  {
    type: 'self_study',
    label: 'Tự học',
    icon: 'menu_book',
    description: 'Làm bài tập và tự ôn luyện tại nhà',
    bg: 'app-green-soft',
    textColor: 'app-green-text',
    borderColor: 'app-green-border',
  },
  {
    type: 'rest',
    label: 'Nghỉ',
    icon: 'weekend',
    description: 'Thời gian nghỉ ngơi',
    bg: 'app-surface-muted',
    textColor: 'app-text-muted',
    borderColor: 'app-border-color',
  },
  {
    type: 'sleep',
    label: 'Ngủ',
    icon: 'bedtime',
    description: 'Giờ ngủ và nghỉ trưa',
    bg: 'app-sleep-soft',
    textColor: 'app-sleep-text',
    borderColor: 'app-sleep-border',
  },
  {
    type: 'sport',
    label: 'Thể thao',
    icon: 'sports_soccer',
    description: 'Vận động và luyện tập',
    bg: 'app-red-soft',
    textColor: 'app-red-text',
    borderColor: 'app-red-border',
  },
  {
    type: 'play',
    label: 'Vui chơi',
    icon: 'toys_and_games',
    description: 'Giải trí và vui chơi',
    bg: 'app-yellow-soft',
    textColor: 'app-yellow-text',
    borderColor: 'app-yellow-border',
  },
  {
    type: 'other',
    label: 'Khác',
    icon: 'more_horiz',
    description: 'Sinh hoạt khác trong ngày',
    bg: 'app-purple-soft',
    textColor: 'app-purple-text',
    borderColor: 'app-purple-border',
  },
];
