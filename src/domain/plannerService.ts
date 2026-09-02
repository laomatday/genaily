import { ScheduleEvent } from '../types';

export interface WeeklyPlanOutput {
  week: string;
  loadScores: Record<string, 'light' | 'mid' | 'heavy'>;
  warnings: string[];
  sessionsCount: number;
}

export function generateSmartWeekPlan(weekKey: string, events: ScheduleEvent[]): WeeklyPlanOutput {
  const loadScores: Record<string, 'light' | 'mid' | 'heavy'> = {
    mon: 'mid',
    tue: 'heavy',
    wed: 'mid',
    thu: 'heavy',
    fri: 'light',
    sat: 'mid',
    sun: 'light'
  };

  const warnings = [
    'Thứ Năm đang hơi nặng (Trường + 90p Toán). Autopilot đã dời bớt English sang thứ Bảy.'
  ];

  return {
    week: weekKey,
    loadScores,
    warnings,
    sessionsCount: events.filter(e => e.type === 'learning').length
  };
}
