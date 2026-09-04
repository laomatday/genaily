import type { ScheduleEventRow } from '../lib/familyRepository';
import type { ScheduleEventType } from '../types';
import { formatActivityName, isSelfStudyType, sortScheduleEvents } from '../domain/schedulePolicy';
import { MaterialIcon, type MaterialIconName } from './MaterialIcon';

const theme: Record<ScheduleEventType, string> = {
  school: 'app-blue-soft app-blue-border app-blue-text',
  extra: 'app-orange-soft app-orange-border app-orange-text',
  self_study: 'app-green-soft app-green-border app-green-text',
  learning: 'app-green-soft app-green-border app-green-text',
  sport: 'app-red-soft app-red-border app-red-text',
  routine: 'app-purple-soft app-purple-border app-purple-text',
  rest: 'app-surface-muted app-border-color app-text-muted',
  sleep: 'app-sleep-soft app-sleep-border app-sleep-text',
  play: 'app-yellow-soft app-yellow-border app-yellow-text',
  other: 'app-purple-soft app-purple-border app-purple-text',
};

const categoryLabel: Record<ScheduleEventType, string> = {
  school: 'Học ở trường',
  extra: 'Học thêm',
  self_study: 'Tự học',
  learning: 'Học tập',
  sport: 'Vận động',
  routine: 'Sinh hoạt',
  rest: 'Nghỉ ngơi',
  sleep: 'Ngủ',
  play: 'Vui chơi',
  other: 'Hoạt động khác',
};

const categoryIcon: Record<ScheduleEventType, MaterialIconName> = {
  school: 'school',
  extra: 'calculate',
  self_study: 'menu_book',
  learning: 'menu_book',
  sport: 'sports_soccer',
  routine: 'today',
  rest: 'weekend',
  sleep: 'bedtime',
  play: 'toys_and_games',
  other: 'event_available',
};

export function ScheduleList({ events, onEdit, date = new Date() }: {
  events: ScheduleEventRow[];
  onEdit?: (event: ScheduleEventRow) => void;
  date?: Date;
}) {
  if (events.length === 0) return <p className="empty-card">Chưa có hoạt động.</p>;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const displayedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sortedEvents = sortScheduleEvents(events);

  return (
    <div className="schedule-timeline">
      {sortedEvents.map((event) => {
        let displayStatus = 'Sắp tới';
        if (event.status === 'completed') {
          displayStatus = 'Hoàn thành';
        } else if (displayedDate < today) {
          displayStatus = 'Đã qua';
        } else if (displayedDate === today) {
          const [startHour, startMin] = event.start_time.split(':').map(Number);
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = startMinutes + event.duration_minutes;

          if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
            displayStatus = 'Đang diễn ra';
          } else if (currentMinutes > endMinutes) {
            displayStatus = 'Đã qua';
          }
        }

        const content = (
          <>
            <span className="schedule-time">{event.start_time.slice(0, 5)}</span>
            <span className={`schedule-card ${theme[event.event_type] || 'app-surface app-border-color app-text-color'}`}>
              <span className="schedule-card-icon"><MaterialIcon name={categoryIcon[event.event_type]} /></span>
              <span className="schedule-card-body">
                <b className="schedule-card-title">{formatActivityName(event.subject, event.title)}</b>
                <small className="schedule-card-meta">{categoryLabel[event.event_type]} · {event.duration_minutes} phút</small>
              </span>
              <small className="schedule-card-status">{displayStatus}</small>
            </span>
          </>
        );

        return isSelfStudyType(event.event_type) && onEdit ? (
          <button
            key={event.id}
            type="button"
            onClick={() => onEdit(event)}
            aria-label={`Xem chi tiết buổi tự học ${event.subject ?? event.title}`}
            className="schedule-row is-interactive"
          >
            {content}
          </button>
        ) : (
          <div key={event.id} className="schedule-row">
            {content}
          </div>
        );
      })}
    </div>
  );
}
