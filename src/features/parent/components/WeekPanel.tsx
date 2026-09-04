import { ScheduleList } from '../../../components/ScheduleList';
import { StatusBadge } from '../../../components/DesignSystem';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { calculateDayLoads } from '../../../domain/plannerService';
import { completionPercent, durationBetweenMinutes, isLearningEvent } from '../../../domain/progressMetrics';
import { formatLocalDateKey, formatWeekRange, getWeekDays } from '../../../lib/date';
import type { FamilyData } from '../../../lib/familyRepository';
import type { DayKey } from '../../../types';

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
  const selected = days.find((day) => day.key === selectedDay) ?? days[0];
  const selectedDateKey = formatLocalDateKey(selected.date);
  const currentWeekOccurrences = data.occurrences.filter((item) => weekDateKeys.has(item.occurrence_date));
  const selectedOccurrences = new Map(
    currentWeekOccurrences
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
  const loads = calculateDayLoads(data.schedule);
  const selectedLoad = loads.find((load) => load.day === selectedDay);
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
        <div className="fixed-schedule-heading"><div><h2>Lịch học cố định theo tuần</h2><p>Tính chỉnh khung giờ học tập yên tĩnh, giờ ngủ và các hoạt động sau giờ học.</p></div><span><MaterialIcon name="calendar_month" /></span></div>
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
          <div><span className="screen-eyebrow">Dòng thời gian</span><h2 id="weekly-timeline-title">{selected.longName}</h2></div>
          <StatusBadge
            status={selectedLoad?.level === 'heavy' ? 'warning' : 'success'}
            label={selectedLoad?.level === 'heavy' ? 'Tải cao' : selectedLoad?.level === 'mid' ? 'Vừa' : 'Nhẹ'}
          />
        </div>
        <div className="week-day-strip" aria-label="Chọn ngày trong tuần">
          {days.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => onSelectDay(day.key)}
              aria-pressed={selectedDay === day.key}
              className={selectedDay === day.key ? 'is-selected' : ''}
            >
              <b>{day.shortName}</b><span>{day.date.getDate()}</span>
            </button>
          ))}
        </div>
        <ScheduleList events={events} date={selected.date} onEdit={onOpenSetup} />
      </section>

      <div className="week-sync-actions">
        <button type="button" className="primary-action" onClick={onOpenSetup}><MaterialIcon name="auto_awesome" />Lịch tự lặp hằng tuần</button>
        <button type="button" className="secondary-action" onClick={() => void onRefresh().catch(() => undefined)}><MaterialIcon name="sync" />Đồng bộ lịch</button>
      </div>
    </section>
  );
}
