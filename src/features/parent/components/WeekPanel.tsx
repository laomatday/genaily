import { useState } from 'react';
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
  const childName = data.child.full_name || 'Bé';
  const days = getWeekDays();
  const weekDateKeys = new Set(days.map((day) => formatLocalDateKey(day.date)));
  const currentWeekOccurrences = data.occurrences.filter((item) => weekDateKeys.has(item.occurrence_date));
  const loads = calculateDayLoads(data.schedule);
  const learningMinutes = data.schedule
    .filter((event) => isLearningEvent(event.event_type))
    .reduce((sum, event) => sum + event.duration_minutes, 0);
  const otherMinutes = data.schedule
    .filter((event) => !isLearningEvent(event.event_type))
    .reduce((sum, event) => sum + event.duration_minutes, 0);
  const completedOccurrences = currentWeekOccurrences.filter((item) => item.status === 'completed');
  const completedMinutes = completedOccurrences.reduce(
    (sum, item) => sum + durationBetweenMinutes(item.starts_at, item.ends_at),
    0,
  );
  const weekTotal = Math.max(currentWeekOccurrences.length, data.schedule.length);
  const weekProgress = completionPercent(completedOccurrences.length, weekTotal);
  const subjectMinutes = [...data.schedule.reduce((subjects, event) => {
    if (!isLearningEvent(event.event_type) || !event.subject) return subjects;
    subjects.set(event.subject, (subjects.get(event.subject) ?? 0) + event.duration_minutes);
    return subjects;
  }, new Map<string, number>())].sort((left, right) => right[1] - left[1]);

  const [openDays, setOpenDays] = useState<Set<DayKey>>(() => {
    const todayDateKey = formatLocalDateKey();
    const todayIndex = days.findIndex((day) => formatLocalDateKey(day.date) === todayDateKey);
    const selectedIndex = days.findIndex((day) => day.key === selectedDay);
    const startIndex = todayIndex >= 0 ? todayIndex : Math.max(0, selectedIndex);
    const initial = new Set<DayKey>();
    const current = days[startIndex];
    const next = days[startIndex + 1];
    if (current) initial.add(current.key);
    if (next) initial.add(next.key);
    return initial;
  });

  const ensureDayOpen = (day: DayKey) => {
    setOpenDays((current) => {
      if (current.has(day)) return current;
      const next = new Set(current);
      next.add(day);
      return next;
    });
  };

  const toggleDay = (day: DayKey) => {
    onSelectDay(day);
    setOpenDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const scrollToDay = (day: DayKey) => {
    onSelectDay(day);
    ensureDayOpen(day);
    window.requestAnimationFrame(() => {
      document.getElementById(`week-day-${day}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <section className="dashboard-panel">
      <header className="screen-intro screen-intro-with-action">
        <div>
          <span className="screen-eyebrow">Học kỳ hiện tại</span>
          <h1>{formatWeekRange()}</h1>
          <p>Lịch tuần của {childName}</p>
        </div>
        <button type="button" className="compact-primary-button" onClick={onOpenSetup}>
          <MaterialIcon name="edit" /> Thiết lập
        </button>
      </header>

      <article className="fixed-schedule-card">
        <span className="fixed-schedule-tag"><MaterialIcon name="tune" />Thói quen & Lịch trình</span>
        <div className="fixed-schedule-heading"><div><h2>Lịch học cố định theo tuần</h2><p>Tinh chỉnh khung giờ học tập yên tĩnh, giờ ngủ và các hoạt động sau giờ học.</p></div><span><MaterialIcon name="calendar_month" /></span></div>
        <button type="button" className="primary-action" onClick={onOpenSetup}>Thiết lập thời khóa biểu <MaterialIcon name="arrow_forward" /></button>
      </article>

      <article className="week-overview-card">
        <div className="daily-overview-heading">
          <div><span className="live-dot" aria-hidden="true" /><b>Tổng quan tuần</b></div>
          <strong>{weekProgress}%</strong>
        </div>
        <p>{completedOccurrences.length}/{weekTotal} hoạt động hoàn thành · {completedMinutes} phút đã ghi nhận</p>
        <progress className="dashboard-progress" value={weekProgress} max={100} aria-label={`Tiến độ tuần ${weekProgress}%`} />
        <div className="weekly-summary-grid">
          <span><MaterialIcon name="school" /><b>{Math.round(learningMinutes / 6) / 10}h</b><small>Học tập</small></span>
          <span><MaterialIcon name="weekend" /><b>{Math.round(otherMinutes / 6) / 10}h</b><small>Sinh hoạt khác</small></span>
          <span><MaterialIcon name="warning" /><b>{loads.filter((load) => load.level === 'heavy').length}</b><small>Ngày tải cao</small></span>
        </div>
      </article>

      {subjectMinutes.length > 0 ? (
        <section className="dashboard-section" aria-labelledby="subject-distribution-title">
          <div className="section-heading-row">
            <div><span className="screen-eyebrow">Phân bổ học tập</span><h2 id="subject-distribution-title">Theo môn học</h2></div>
            <span className="section-count">{subjectMinutes.length}</span>
          </div>
          <div className="subject-distribution-list">
            {subjectMinutes.slice(0, 4).map(([subject, minutes], index) => (
              <div key={subject} className="subject-distribution-row">
                <span className={`subject-distribution-dot subject-swatch-${index % 8}`} aria-hidden="true" />
                <div><b>{subject}</b><progress value={minutes} max={Math.max(...subjectMinutes.map((item) => item[1]))} aria-label={`${subject}: ${minutes} phút`} /></div>
                <strong>{minutes}'</strong>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <button type="button" className="schedule-setup-prompt" onClick={onOpenSetup}>
          <span><MaterialIcon name="calendar_month" /></span>
          <span><b>Thiết lập lịch đầu tiên</b><small>Thêm hoạt động học, nghỉ ngơi và vận động cho {childName}.</small></span>
          <MaterialIcon name="chevron_right" />
        </button>
      )}

      <section className="dashboard-section" aria-labelledby="weekly-timeline-title">
        <div className="section-heading-row">
          <div><span className="screen-eyebrow">Dòng thời gian</span><h2 id="weekly-timeline-title">Lịch cả tuần</h2></div>
          <span className="section-count">{data.schedule.length}</span>
        </div>

        <div className="week-day-strip" aria-label="Đi nhanh đến ngày trong tuần">
          {days.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => scrollToDay(day.key)}
              aria-pressed={selectedDay === day.key}
              className={selectedDay === day.key ? 'is-selected' : ''}
            >
              <b>{day.shortName}</b><span>{day.date.getDate()}</span>
            </button>
          ))}
        </div>

        <div className="week-all-days">
          {days.map((day) => {
            const dateKey = formatLocalDateKey(day.date);
            const occurrenceMap = new Map(
              currentWeekOccurrences
                .filter((item) => item.occurrence_date === dateKey && item.schedule_event_id)
                .map((item) => [item.schedule_event_id, item]),
            );
            const dayEvents = data.schedule
              .filter((event) => event.day_of_week === day.key)
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
            const dayLoad = loads.find((load) => load.day === day.key);
            const isHeavy = dayLoad?.level === 'heavy';
            const isOpen = openDays.has(day.key);
            const contentId = `week-day-content-${day.key}`;

            return (
              <section
                key={day.key}
                id={`week-day-${day.key}`}
                className={`week-day-section ${selectedDay === day.key ? 'is-selected-day' : ''} ${isOpen ? 'is-open' : 'is-collapsed'}`}
                aria-labelledby={`week-day-title-${day.key}`}
              >
                <button
                  type="button"
                  className="section-heading-row week-day-heading week-day-toggle"
                  aria-expanded={isOpen}
                  aria-controls={contentId}
                  onClick={() => toggleDay(day.key)}
                >
                  <span className="week-day-heading-copy">
                    <span className="screen-eyebrow">{day.shortName} · {day.date.getDate()}/{day.date.getMonth() + 1}</span>
                    <strong id={`week-day-title-${day.key}`} className="week-day-title">{day.longName}</strong>
                  </span>
                  <span className="week-day-heading-meta">
                    <span className="week-day-activity-count">{dayEvents.length} hoạt động</span>
                    {isHeavy ? <StatusBadge status="warning" label="Tải cao" /> : null}
                    <span className="week-day-toggle-icon"><MaterialIcon name={isOpen ? 'expand_less' : 'expand_more'} /></span>
                  </span>
                </button>

                {isOpen ? (
                  <div id={contentId} className="week-day-content">
                    {dayEvents.length > 0 ? (
                      <ScheduleList events={dayEvents} date={day.date} onEdit={onOpenSetup} />
                    ) : (
                      <p className="empty-card">Chưa có hoạt động.</p>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>

      <div className="week-sync-actions">
        <button type="button" className="primary-action" onClick={onOpenSetup}><MaterialIcon name="auto_awesome" />Lịch tự lặp hằng tuần</button>
        <button type="button" className="secondary-action" onClick={() => void onRefresh().catch(() => undefined)}><MaterialIcon name="sync" />Đồng bộ lịch</button>
      </div>
    </section>
  );
}
