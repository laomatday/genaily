import { ScheduleList } from '../../../components/ScheduleList';
import { StatusBadge } from '../../../components/DesignSystem';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { calculateDayLoads } from '../../../domain/plannerService';
import { formatLocalDateKey, formatWeekRange, getWeekDays } from '../../../lib/date';
import type { FamilyData } from '../../../lib/familyRepository';
import type { DayKey } from '../../../types';
import './WeekPanel.mobile.css';

interface WeekPanelProps {
  data: FamilyData;
  selectedDay: DayKey;
  onSelectDay: (day: DayKey) => void;
  onOpenSetup: () => void;
  onRefresh: () => Promise<void>;
}

export function WeekPanel({ data, selectedDay, onSelectDay, onOpenSetup, onRefresh }: WeekPanelProps) {
  const days = getWeekDays();
  const selected = days.find((day) => day.key === selectedDay) ?? days[0];
  const selectedDateKey = formatLocalDateKey(selected.date);
  const todayDateKey = formatLocalDateKey();
  const loads = calculateDayLoads(data.schedule);
  const selectedLoad = loads.find((load) => load.day === selected.key);

  const occurrenceMap = new Map(
    data.occurrences
      .filter((item) => item.occurrence_date === selectedDateKey && item.schedule_event_id)
      .map((item) => [item.schedule_event_id, item]),
  );

  const events = data.schedule
    .filter((event) => event.day_of_week === selected.key)
    .map((event) => {
      const occurrence = occurrenceMap.get(event.id);
      return {
        ...event,
        status: occurrence?.status === 'completed'
          ? 'completed' as const
          : occurrence?.status === 'in_progress'
            ? 'live' as const
            : 'upcoming' as const,
      };
    });

  const countsByDay = new Map<DayKey, number>(
    days.map((day) => [
      day.key,
      data.schedule.filter((event) => event.day_of_week === day.key).length,
    ]),
  );

  return (
    <section className="dashboard-panel week-compact-panel">
      <header className="week-compact-topbar">
        <div className="week-compact-title">
          <span className="screen-eyebrow">Lịch tuần</span>
          <h1>{formatWeekRange()}</h1>
        </div>
        <div className="week-compact-actions">
          <button
            type="button"
            className="week-icon-action"
            onClick={() => void onRefresh().catch(() => undefined)}
            aria-label="Đồng bộ lịch"
          >
            <MaterialIcon name="sync" />
          </button>
          <button
            type="button"
            className="week-icon-action is-primary"
            onClick={onOpenSetup}
            aria-label="Chỉnh thời khóa biểu"
          >
            <MaterialIcon name="edit" />
          </button>
        </div>
      </header>

      <div className="week-day-strip" aria-label="Chọn ngày trong tuần">
        {days.map((day) => {
          const dateKey = formatLocalDateKey(day.date);
          const isToday = dateKey === todayDateKey;
          const isSelected = selectedDay === day.key;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => onSelectDay(day.key)}
              aria-pressed={isSelected}
              className={`${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
            >
              <b>{day.shortName}</b>
              <span>{day.date.getDate()}</span>
              <small>{countsByDay.get(day.key) ?? 0}</small>
            </button>
          );
        })}
      </div>

      <section className="week-active-day" aria-labelledby="week-active-day-title">
        <header className="week-active-day-header">
          <div>
            <h2 id="week-active-day-title">{selected.longName}</h2>
            <small>{selected.date.getDate()}/{selected.date.getMonth() + 1} · {events.length} hoạt động</small>
          </div>
          {selectedLoad?.level === 'heavy' ? <StatusBadge status="warning" label="Tải cao" /> : null}
        </header>

        {events.length > 0 ? (
          <ScheduleList events={events} date={selected.date} onEdit={onOpenSetup} />
        ) : (
          <p className="empty-card">Chưa có hoạt động.</p>
        )}
      </section>
    </section>
  );
}
