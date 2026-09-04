import { useMemo } from 'react';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { getActivityDetail } from '../../../domain/schedulePolicy';
import { DAY_KEYS, DAY_LONG_VI, DAY_SHORT_VI } from '../../../lib/date';
import { ACTIVITY_CATEGORIES, type DayKey } from '../../../types';
import { minutesToTime, timeToMinutes, type ConflictInfo, type DraftSubject } from './scheduleDraftModel';

interface ScheduleWeekPreviewProps {
  drafts: DraftSubject[];
  conflicts: ConflictInfo[];
  selectedDay: DayKey;
  onSelectDay: (day: DayKey) => void;
  onEditDraft: (key: string) => void;
}

export function ScheduleWeekPreview({
  drafts,
  conflicts,
  selectedDay,
  onSelectDay,
  onEditDraft,
}: ScheduleWeekPreviewProps) {
  const conflictingDays = useMemo(() => new Set(conflicts.map((conflict) => conflict.day)), [conflicts]);
  const daySlots = useMemo(() => drafts
    .filter((draft) => draft.days.includes(selectedDay))
    .map((draft) => {
      const startMinutes = timeToMinutes(draft.startTime) ?? 0;
      const duration = typeof draft.duration === 'number' ? draft.duration : 0;
      return {
        draft,
        startMinutes,
        endMinutes: startMinutes + duration,
        conflict: conflicts.some((item) => item.day === selectedDay
          && (item.slot1.draftKey === draft.key || item.slot2.draftKey === draft.key)),
      };
    })
    .sort((left, right) => left.startMinutes - right.startMinutes), [conflicts, drafts, selectedDay]);

  return (
    <div className="schedule-week-preview mb-5 rounded-[24px] border app-border-color app-surface p-4 shadow-sm">
      <div className="schedule-week-preview-header mb-3">
        <div className="schedule-week-preview-copy">
          <b className="text-xs font-black uppercase tracking-wider app-text-muted">Lịch hoạt động theo thứ trong tuần</b>
          <p className="text-[11px] app-text-muted">Chọn từng thứ để xem lịch đã xếp và giờ trống.</p>
        </div>
        <span className="schedule-week-preview-count rounded-full app-blue-soft px-2.5 py-0.5 text-[10px] font-bold app-primary-text">
          {drafts.flatMap((draft) => draft.days).length} mục/tuần
        </span>
      </div>

      <div className="schedule-week-day-grid" role="tablist" aria-label="Ngày trong tuần">
        {DAY_KEYS.map((day, index) => {
          const count = drafts.filter((draft) => draft.days.includes(day)).length;
          const selected = selectedDay === day;
          const hasConflict = conflictingDays.has(day);
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`${DAY_LONG_VI[index]}: ${count} hoạt động${hasConflict ? ', có trùng giờ' : ''}`}
              onClick={() => onSelectDay(day)}
              className={`schedule-week-day-option relative flex min-w-0 flex-col items-center justify-center rounded-2xl py-2 transition ${
                selected ? 'app-strong-bg app-on-strong shadow-md'
                  : hasConflict ? 'border app-red-border app-red-soft app-red-text'
                    : count > 0 ? 'border app-border-color app-background app-text-color'
                      : 'border border-dashed app-border-color app-surface app-text-muted'
              }`}
            >
              {hasConflict ? <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full app-red-solid app-on-danger text-[8px]">!</span> : null}
              <span className="text-[11px] font-black">{DAY_SHORT_VI[index]}</span>
              <span className={`mt-0.5 text-[9px] font-semibold ${selected ? 'app-primary-text' : ''}`}>
                {count > 0 ? `${count} mục` : 'Trống'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3.5 rounded-[18px] app-surface-subtle p-3 border app-border-color" role="tabpanel">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-black app-text-color">
            {DAY_LONG_VI[DAY_KEYS.indexOf(selectedDay)]} ({daySlots.length} hoạt động)
          </span>
          {conflictingDays.has(selectedDay) ? <span className="rounded-md app-red-soft px-2 py-0.5 text-[10px] font-extrabold app-red-text">Có trùng giờ</span> : null}
        </div>
        {daySlots.length === 0 ? (
          <div className="py-2 text-center text-xs app-text-muted">Chưa có hoạt động nào vào ngày này.</div>
        ) : (
          <div className="space-y-1.5">
            {daySlots.map(({ draft, endMinutes, conflict }) => {
              const category = ACTIVITY_CATEGORIES.find((item) => item.type === draft.category)
                ?? ACTIVITY_CATEGORIES.at(-1)!;
              const detail = getActivityDetail(draft.subject, draft.title);
              return (
                <button
                  key={draft.key}
                  type="button"
                  onClick={() => onEditDraft(draft.key)}
                  className={`schedule-week-event-row flex w-full min-w-0 items-center rounded-xl border p-2.5 text-left transition hover:shadow-sm ${conflict ? 'app-red-border app-red-soft' : 'app-border-color app-surface'}`}
                >
                  <span className="schedule-week-event-main flex min-w-0 flex-1 items-center gap-2.5">
                    <MaterialIcon name={category.icon} className="schedule-week-event-icon text-lg app-text-muted" />
                    <span className="schedule-week-event-copy min-w-0">
                      <span className="schedule-week-event-title-row flex min-w-0 items-center gap-1.5">
                        <b className="schedule-week-event-title min-w-0 flex-1 truncate text-xs app-text-color">{draft.subject || draft.title || 'Hoạt động'}</b>
                        <span className={`schedule-week-event-category rounded px-1.5 py-0.2 text-[9px] font-bold ${category.bg} ${category.textColor}`}>{category.label}</span>
                      </span>
                      {detail ? <span className="block truncate text-[10px] app-text-muted">{detail}</span> : null}
                    </span>
                  </span>
                  <span className="schedule-week-event-time flex-shrink-0 text-right">
                    <span className="block text-xs font-bold app-text-color">{draft.startTime || '--:--'} – {minutesToTime(endMinutes)}</span>
                    <span className="text-[10px] app-text-muted">{draft.duration || 0} phút</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
