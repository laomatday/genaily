import { useState } from 'react';
import { ScheduleList } from '../../../components/ScheduleList';
import { StatusBadge } from '../../../components/DesignSystem';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { calculateDayLoads } from '../../../domain/plannerService';
import { completionPercent } from '../../../domain/progressMetrics';
import { formatLocalDateKey, formatWeekRange, getDayKey, getWeekDays } from '../../../lib/date';
import type { FamilyData } from '../../../lib/familyRepository';
import type { DayKey } from '../../../types';

export function ChildWeekPanel({ data, onOpenMenu }: { data: FamilyData; onOpenMenu: () => void }) {
  const [selectedDay, setSelectedDay] = useState<DayKey>(() => getDayKey());
  const days = getWeekDays();
  const selected = days.find((day) => day.key === selectedDay) ?? days[0];
  const weekKeys = new Set(days.map((day) => formatLocalDateKey(day.date)));
  const occurrences = data.occurrences.filter((item) => weekKeys.has(item.occurrence_date));
  const completed = occurrences.filter((item) => item.status === 'completed').length;
  const total = Math.max(occurrences.length, data.schedule.length);
  const progress = completionPercent(completed, total);
  const selectedDateKey = formatLocalDateKey(selected.date);
  const selectedOccurrences = new Map(
    occurrences
      .filter((item) => item.occurrence_date === selectedDateKey && item.schedule_event_id)
      .map((item) => [item.schedule_event_id, item]),
  );
  const events = data.schedule
    .filter((event) => event.day_of_week === selectedDay)
    .map((event) => {
      const occurrence = selectedOccurrences.get(event.id);
      return {
        ...event,
        status: occurrence?.status === 'completed'
          ? 'completed' as const
          : occurrence?.status === 'in_progress'
            ? 'live' as const
            : 'upcoming' as const,
      };
    });
  const selectedLoad = calculateDayLoads(data.schedule).find((load) => load.day === selectedDay);

  return (
    <section className="child-dashboard-panel">
      <header className="screen-intro screen-intro-with-action">
        <div><span className="screen-eyebrow">{formatWeekRange()}</span><h1>Lịch của {data.child.full_name || 'bé'}</h1><p>Con xem lịch và chuẩn bị; mọi thay đổi do ba/mẹ quản lý.</p></div>
        <button type="button" onClick={onOpenMenu} className="header-icon-button" aria-label="Mở menu tài khoản"><MaterialIcon name="menu" /></button>
      </header>

      <article className="child-week-overview">
        <span><MaterialIcon name="calendar_month" /></span>
        <div><b>{progress}% tuần này</b><small>{completed}/{total} hoạt động đã hoàn thành</small><progress className="dashboard-progress" value={progress} max={100} aria-label={`Tiến độ tuần ${progress}%`} /></div>
      </article>

      <div className="week-day-strip child-week-day-strip" aria-label="Chọn ngày trong tuần">
        {days.map((day) => (
          <button
            key={day.key}
            type="button"
            onClick={() => setSelectedDay(day.key)}
            aria-pressed={selectedDay === day.key}
            className={selectedDay === day.key ? 'is-selected' : ''}
          >
            <b>{day.shortName}</b><span>{day.date.getDate()}</span>
          </button>
        ))}
      </div>

      <section className="dashboard-section" aria-labelledby="child-selected-day">
        <div className="section-heading-row">
          <div><span className="screen-eyebrow">{events.length} hoạt động</span><h2 id="child-selected-day">{selected.longName}</h2></div>
          <StatusBadge
            status={selectedLoad?.level === 'heavy' ? 'warning' : 'success'}
            label={selectedLoad?.level === 'heavy' ? 'Tải cao' : selectedLoad?.level === 'mid' ? 'Vừa' : 'Nhẹ'}
          />
        </div>
        <ScheduleList events={events} date={selected.date} />
      </section>
    </section>
  );
}
