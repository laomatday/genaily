import type { DayKey } from '../types';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_SHORT_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const DAY_LONG_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

export function getDayKey(date = new Date()): DayKey {
  return DAY_KEYS[(date.getDay() + 6) % 7];
}

export function startOfWeek(date = new Date()): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

export function getWeekDays(date = new Date()) {
  const start = startOfWeek(date);
  return DAY_KEYS.map((key, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return { key, date: value, shortName: DAY_SHORT_VI[index], longName: DAY_LONG_VI[index] };
  });
}

export function formatWeekRange(date = new Date()): string {
  const days = getWeekDays(date);
  const format = (value: Date) => `${value.getDate()}/${value.getMonth() + 1}`;
  return `${format(days[0].date)}–${format(days[6].date)}`;
}

export function formatTodayLabel(date = new Date()): string {
  const index = DAY_KEYS.indexOf(getDayKey(date));
  return `${DAY_LONG_VI[index]} · ${date.getDate()}/${date.getMonth() + 1}`;
}

export function formatLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
