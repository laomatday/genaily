import { ScheduleList } from '../../../components/ScheduleList';
import { StatusBadge } from '../../../components/DesignSystem';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { calculateDayLoads } from '../../../domain/plannerService';
import { completionPercent, durationBetweenMinutes, isLearningEvent } from '../../../domain/progressMetrics';
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

  const weekDateKeys = new Set(days.map((day) => formatLocalDateKey(day.date)));
  const currentWeekOccurrences = data.occurrences.filter((item) => weekDateKeys.has(item.occurrence_date));
  const completedOccurrences = currentWeekOccurrences.filter((item) => item.status === 'completed');
  const completedMinutes = completedOccurrences.reduce(
    (sum, item) => sum + durationBetweenMinutes(item.starts_at, item.ends_at),
    0,
  );
  const weekTotal = Math.max(currentWeekOccurrences.length, data.schedule.length);
  const weekProgress = completionPercent(completedOccurrences.length, weekTotal);
  const learningMinutes = data.schedule
    .filter((event) => isLearningEvent(event.event_type))
    .reduce((sum, event) => sum + event.duration_minutes, 0);
  const otherMinutes = data.schedule
    .filter((event) => !isLearningEvent(event.event_type))
    .reduce((sum, event) => sum + event.duration_minutes, 0);
  const heavyDays = loads.filter((load) => load.level === 'heavy').length;
  const subjectMinutes = [...data.schedule.reduce((subjects, event) => {
    if (!isLearningEvent(event.event_type) || !event.subject) return subjects;
    subjects.set(event.subject, (subjects.get(event.subject) ?? 0) + event.duration_minutes);
    return subjects;
  }, new Map<string, number>())]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4);

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

      <section className="week-dashboard-compact" aria-label="Tổng quan lịch tuần">
        <article className="week-dashboard-main">
          <div className="week-dashboard-main-copy">
            <span className="screen-eyebrow">Tổng quan tuần</span>
            <strong>{weekProgress}%</strong>
            <small>{completedOccurrences.length}/{weekTotal} hoạt động · {completedMinutes} phút đã ghi nhận</small>
          </div>
          <progress value={weekProgress} max={100} aria-label={`Tiến độ tuần ${weekProgress}%`} />
        </article>

        <div className="week-dashboard-stats">
          <span><MaterialIcon name="school" /><b>{Math.round(learningMinutes / 6) / 10}h</b><small>Học tập</small></span>
          <span><MaterialIcon name="weekend" /><b>{Math.round(otherMinutes / 6) / 10}h</b><small>Sinh hoạt</small></span>
          <span><MaterialIcon name="warning" /><b>{heavyDays}</b><small>Tải cao</small></span>
        </div>

        {subjectMinutes.length > 0 ? (
          <div className="week-subject-strip" aria-label="Phân bổ môn học nổi bật">
            {subjectMinutes.map(([subject, minutes]) => (
              <span key={subject} className="week-subject-chip">
                <b>{subject}</b>
                <small>{minutes}'</small>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="week-active-day" aria-labelledby="week-active-day-title">
        <header className="week-active-day-header">
          <div>
            <span className="screen-eyebrow">Lịch đang xem</span>
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
