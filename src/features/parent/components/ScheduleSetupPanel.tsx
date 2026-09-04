import { useState, useMemo, type ReactNode } from 'react';
import { AppDropdown } from '../../../components/AppDropdown';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { createRandomUuid } from '../../../lib/randomId';
import { isLearningActivityType, isSelfStudyType } from '../../../domain/schedulePolicy';
import { DAY_KEYS, DAY_SHORT_VI, getDayKey } from '../../../lib/date';
import type { FamilyData, ScheduleSetupItem } from '../../../lib/familyRepository';
import { ACTIVITY_CATEGORIES, type DayKey, type ScheduleEventType } from '../../../types';
import {
  calculateConflicts,
  makeDrafts,
  minutesToTime,
  subjectSwatchClass,
  timeToMinutes,
  type DraftSubject,
} from './scheduleDraftModel';
import { ScheduleWeekPreview } from './ScheduleWeekPreview';

const CUSTOM_SUBJECT_VALUE = '__custom_subject__';

interface ScheduleSetupPanelProps {
  data: FamilyData;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (items: ScheduleSetupItem[]) => Promise<void>;
}

export function ScheduleSetupPanel({ data, saving, error, onBack, onSave }: ScheduleSetupPanelProps) {
  const [drafts, setDrafts] = useState<DraftSubject[]>(() => makeDrafts(data));
  const [activeKey, setActiveKey] = useState<string | null>(() => makeDrafts(data)[0]?.key ?? null);
  const [previewDay, setPreviewDay] = useState<DayKey>(getDayKey());
  const [dirty, setDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const conflicts = useMemo(() => calculateConflicts(drafts), [drafts]);
  const conflictingDraftKeys = useMemo(
    () => new Set(conflicts.flatMap((c) => [c.slot1.draftKey, c.slot2.draftKey])),
    [conflicts]
  );
  const orderedDrafts = useMemo(
    () => [...drafts].sort((left, right) => (
      left.startTime.localeCompare(right.startTime)
      || left.title.localeCompare(right.title, 'vi')
    )),
    [drafts],
  );

  const update = (key: string, patch: Partial<DraftSubject>) => {
    setDrafts((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setDirty(true);
  };

  const toggleDay = (draft: DraftSubject, day: DayKey) => {
    update(draft.key, {
      days: draft.days.includes(day) ? draft.days.filter((value) => value !== day) : [...draft.days, day],
    });
  };

  const addActivity = () => {
    const key = createRandomUuid();
    const goal = data.goals.find(
      (item) => item.status === 'active' && !drafts.some((draft) => draft.subject === item.subject)
    );
    const initialSubject = goal?.subject ?? data.subjectSuggestions[0]?.subject_name ?? '';
    const next: DraftSubject = {
      key,
      subject: initialSubject,
      subjectSource: data.subjectSuggestions.some((item) => item.subject_name === initialSubject) ? 'catalog' : 'custom',
      title: '',
      category: 'self_study',
      startTime: '19:30',
      duration: goal?.target_minutes ?? 60,
      studyLock: true,
      days: [getDayKey()],
      idsByDay: {},
      statusByDay: {},
      sortByDay: {},
    };
    setDrafts((items) => [...items, next]);
    setActiveKey(key);
    setDirty(true);
  };

  const save = async () => {
    setValidationError(null);
    const invalid = drafts.find(
      (draft) =>
        (isLearningActivityType(draft.category) && !draft.subject.trim()) ||
        (isLearningActivityType(draft.category) && !draft.studyLock) ||
        (!isLearningActivityType(draft.category) && !draft.title.trim()) ||
        !draft.startTime ||
        typeof draft.duration !== 'number' ||
        draft.duration < 5 ||
        draft.days.length === 0
    );
    if (invalid) {
      setActiveKey(invalid.key);
      setValidationError('Mỗi hoạt động cần tên, giờ, thời lượng từ 5 phút và ít nhất một ngày.');
      return;
    }

    const items = drafts.flatMap((draft, groupIndex) =>
      draft.days.map((day, dayIndex): ScheduleSetupItem => {
        const learningActivity = isLearningActivityType(draft.category);
        const selfStudy = isSelfStudyType(draft.category);
        return {
          id: draft.idsByDay[day],
          title: selfStudy ? (draft.title.trim() || draft.subject.trim()) : learningActivity ? draft.subject.trim() : draft.title.trim(),
          subject: learningActivity ? draft.subject.trim() : null,
          day_of_week: day,
          start_time: draft.startTime,
          duration_minutes: draft.duration as number,
          event_type: draft.category as ScheduleEventType,
          status: draft.statusByDay[day] ?? 'upcoming',
          sort_order: draft.sortByDay[day] ?? (groupIndex + 1) * 100 + dayIndex,
          study_lock_enabled: learningActivity,
        };
      })
    );

    try {
      await onSave(items);
      setDirty(false);
      onBack();
    } catch {
      // Keep user on panel if error occurs
    }
  };

  return (
    <section className="min-h-screen pb-32">
      {/* Header */}
      <header className="mb-4 flex items-center justify-between">
        <button
          onClick={() => (dirty ? setShowDiscard(true) : onBack())}
          aria-label="Quay lại"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border app-border-color app-surface text-base shadow-sm hover-app-surface-muted"
        >
          <MaterialIcon name="arrow_back" className="text-xl" />
        </button>
        <div className="text-center">
          <b className="block text-sm font-extrabold app-text-color">Thiết lập lịch hoạt động</b>
          <small className="text-[11px] font-medium app-text-muted">
            {data.child.full_name || 'Bé'}
          </small>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addActivity}
            aria-label="Thêm hoạt động"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border app-primary-border app-primary-bg text-lg font-bold app-on-primary shadow-sm hover-app-primary-bg"
          >
            <MaterialIcon name="add" className="text-xl" />
          </button>
        </div>
      </header>

      {/* Main Title */}
      <div className="mb-4">
        <h1 className="text-2xl font-black app-text-color">Lịch hoạt động của {data.child.full_name || 'Bé'}</h1>
        <p className="mt-1 text-xs app-text-muted">
          Sắp xếp việc học, nghỉ ngơi, ngủ, vui chơi và vận động trong cùng một lịch tuần.
        </p>
      </div>

      {/* OVERLAP / CONFLICT ALERT BANNER */}
      {conflicts.length > 0 && (
        <div className="mb-5 rounded-[22px] border app-red-border app-red-soft p-4 shadow-sm">
          <div className="flex items-start gap-2.5">
            <MaterialIcon name="warning" className="text-xl app-red-text" />
            <div className="min-w-0 flex-1">
              <b className="block text-xs font-black app-red-text">
                Phát hiện {conflicts.length} xung đột trùng lịch!
              </b>
              <div className="mt-1 space-y-1">
                {conflicts.slice(0, 3).map((c, idx) => (
                  <p key={idx} className="text-[11px] leading-relaxed app-red-text">
                    • {c.description}
                  </p>
                ))}
              </div>
              <p className="mt-2 text-[10px] font-bold app-red-text">
                Vui lòng chỉnh lại giờ hoặc thời lượng của các hoạt động bị trùng.
              </p>
            </div>
          </div>
        </div>
      )}

      <ScheduleWeekPreview
        drafts={drafts}
        conflicts={conflicts}
        selectedDay={previewDay}
        onSelectDay={setPreviewDay}
        onEditDraft={setActiveKey}
      />

      {/* ========================================================================= */}
      {/* DRAFT SUBJECTS LIST & EDITORS */}
      {/* ========================================================================= */}
      <div className="mb-3 flex items-center justify-between">
        <b className="text-sm font-black app-text-color">Danh sách hoạt động & lịch chi tiết</b>
        <button
          onClick={addActivity}
          className="flex items-center gap-1 rounded-xl app-blue-soft px-3 py-1.5 text-xs font-bold app-primary-text hover-app-blue-soft"
        >
          <MaterialIcon name="add" className="text-base" />
          <span>Thêm hoạt động</span>
        </button>
      </div>

      <div className="grid gap-3">
        {orderedDrafts.map((draft) => {
          const active = activeKey === draft.key;
          const hasConflict = conflictingDraftKeys.has(draft.key);
          const categoryMeta =
            ACTIVITY_CATEGORIES.find((category) => category.type === draft.category) || ACTIVITY_CATEGORIES.at(-1)!;
          const startMins = timeToMinutes(draft.startTime);
          const dur = typeof draft.duration === 'number' ? draft.duration : 0;
          const endMins = startMins !== null ? startMins + dur : null;

          return (
            <article
              key={draft.key}
              className={`schedule-draft-card ${active ? 'is-active' : ''} overflow-hidden rounded-[24px] border app-surface transition ${
                hasConflict
                  ? 'app-red-border shadow-md ring-1 app-ring-danger'
                  : active
                  ? 'app-blue-border shadow-lg ring-1 app-ring-primary'
                  : 'app-border-color shadow-sm hover-app-border'
              }`}
            >
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => setActiveKey(active ? null : draft.key)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black flex-shrink-0 ${subjectSwatchClass(draft.subject || draft.title || categoryMeta.label)}`}
                >
                  {(draft.subject || draft.title).trim().slice(0, 2).toUpperCase() || '--'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <b className="truncate text-sm app-text-color">{draft.subject || draft.title || 'Hoạt động mới'}</b>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${categoryMeta.bg} ${categoryMeta.textColor} ${categoryMeta.borderColor}`}
                    >
                      {categoryMeta.label}
                    </span>
                    {hasConflict && (
                      <span className="rounded-md app-red-soft px-1.5 py-0.5 text-[9px] font-black app-red-text">
                        Trùng lịch
                      </span>
                    )}
                  </div>
                  <small className="mt-0.5 block truncate text-xs app-text-muted">
                    {draft.days.length
                      ? draft.days.map((day) => DAY_SHORT_VI[DAY_KEYS.indexOf(day)]).join(', ')
                      : 'Chưa chọn ngày'}
                    {draft.startTime ? ` · ${draft.startTime}` : ''}
                    {draft.duration ? ` (${draft.duration}p)` : ''}
                  </small>
                </div>
                <MaterialIcon name={active ? 'expand_less' : 'expand_more'} className="text-xl app-text-muted" />
              </button>

              {/* Accordion Editor Body */}
              {active && (
                <div className="border-t app-border-color app-surface-subtle p-4">
                  <div className="mb-4">
                    <label className="mb-2 block text-xs font-bold app-text-muted">
                      Loại hoạt động <span className="app-red-text">*</span>
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {ACTIVITY_CATEGORIES.map((cat) => {
                        const isSelected = draft.category === cat.type;
                        return (
                          <button
                            key={cat.type}
                            type="button"
                            onClick={() => {
                              const nextIsLearning = isLearningActivityType(cat.type);
                              update(draft.key, {
                                category: cat.type,
                                studyLock: nextIsLearning ? true : false,
                              });
                            }}
                            className={`flex flex-col items-center justify-center rounded-2xl border p-2.5 text-center transition ${
                              isSelected
                                ? 'app-primary-border app-primary-bg app-on-primary shadow-md'
                                : 'app-border-color app-surface app-text-muted hover-app-surface-subtle'
                            }`}
                          >
                            <MaterialIcon name={cat.icon} className="text-lg" />
                            <span className="mt-1 text-xs font-bold leading-tight">{cat.label}</span>
                            <span
                              className={`mt-0.5 line-clamp-2 text-[9px] ${isSelected ? 'app-blue-text' : 'app-text-muted'}`}
                            >
                              {cat.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isLearningActivityType(draft.category) ? (
                    <div className="mb-3">
                      <span className="app-field-label">Môn học</span>
                      <AppDropdown
                        ariaLabel="Môn học"
                        placeholder="Chọn môn học"
                        value={draft.subjectSource === 'custom' ? CUSTOM_SUBJECT_VALUE : draft.subject}
                        onChange={(value) => {
                          update(draft.key, value === CUSTOM_SUBJECT_VALUE
                            ? { subject: '', subjectSource: 'custom' }
                            : { subject: value, subjectSource: 'catalog' });
                        }}
                        options={[
                          ...data.subjectSuggestions.map((suggestion) => ({
                            value: suggestion.subject_name,
                            label: suggestion.subject_name,
                            icon: 'menu_book' as const,
                          })),
                          { value: CUSTOM_SUBJECT_VALUE, label: 'Khác…', icon: 'more_horiz' as const },
                        ]}
                      />
                      {draft.subjectSource === 'custom' ? (
                        <input
                          aria-label="Tên môn học khác"
                          placeholder="Nhập tên môn học khác"
                          value={draft.subject}
                          onChange={(event) => update(draft.key, { subject: event.target.value })}
                          className="field gemini-control"
                        />
                      ) : null}
                      <p className="mt-1.5 text-[10px] app-text-muted">
                        {data.child.grade_level
                          ? `Gợi ý tự động theo lớp ${data.child.grade_level}.`
                          : 'Cập nhật lớp đang học trong hồ sơ bé để nhận gợi ý phù hợp.'}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <Field label="Tên hoạt động">
                        <input
                          placeholder="Ví dụ: Ngủ trưa, Đá bóng, Giờ chơi..."
                          value={draft.title}
                          onChange={(event) => update(draft.key, { title: event.target.value })}
                          className="field gemini-control"
                        />
                      </Field>
                    </div>
                  )}

                  {isSelfStudyType(draft.category) && (
                    <div className="mb-3 rounded-2xl border app-blue-border app-blue-soft p-3">
                      <b className="block text-xs app-primary-text">Chi tiết buổi tự học</b>
                      <p className="mt-1 text-[10px] app-text-muted">
                        Phần này chỉ có ở Tự học và sẽ được dùng để tạo buổi học cho bé.
                      </p>
                      <Field label="Nội dung cần hoàn thành (không bắt buộc)">
                        <input
                          placeholder="Ví dụ: Làm bài SGK trang 45, ôn ngữ pháp..."
                          value={draft.title}
                          onChange={(event) => update(draft.key, { title: event.target.value })}
                          className="field gemini-control"
                        />
                      </Field>
                    </div>
                  )}

                  {isLearningActivityType(draft.category) ? (
                    <div className="focus-lock-card">
                      <div className="focus-lock-card-copy">
                        <b>Khóa tập trung (Study Lock)</b>
                        <small>Khóa ứng dụng giải trí trong toàn bộ khung giờ học</small>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-label={`Khóa tập trung cho ${draft.subject || 'hoạt động học'}`}
                        aria-checked="true"
                        aria-readonly="true"
                        disabled
                        title="Bắt buộc cho mọi hoạt động học"
                        className="focus-lock-switch is-on is-required"
                      >
                        <span className="focus-lock-switch-thumb" />
                      </button>
                    </div>
                  ) : null}

                  {/* Time & Duration with Live End-Time Calculation */}
                  <div className="schedule-time-grid grid grid-cols-2 gap-3">
                    <Field label="Giờ bắt đầu" >
                      <input
                        type="time"
                        value={draft.startTime}
                        onChange={(event) => update(draft.key, { startTime: event.target.value })}
                        className="field gemini-control"
                      />
                    </Field>
                    <Field label="Thời lượng (phút)" >
                      <input
                        type="number"
                        min={5}
                        max={720}
                        placeholder="60"
                        value={draft.duration}
                        onChange={(event) =>
                          update(draft.key, {
                            duration: event.target.value ? Number(event.target.value) : '',
                          })
                        }
                        className="field gemini-control"
                      />
                    </Field>
                  </div>

                  {/* Live Calculated Time Window Notice */}
                  {draft.startTime && typeof draft.duration === 'number' && endMins !== null && (
                    <div className="mt-2 flex items-center justify-between rounded-xl app-blue-soft px-3 py-2 text-xs app-blue-text">
                      <span className="font-semibold">
                        Khung giờ: <b>{draft.startTime}</b> – <b>{minutesToTime(endMins)}</b> ({draft.duration} phút)
                      </span>
                    </div>
                  )}

                  {/* Multi-day Selector */}
                  <div className="mt-4">
                    <b className="mb-2 block text-xs app-text-muted">Lặp lại vào các ngày trong tuần</b>
                    <div className="flex justify-between gap-1">
                      {DAY_KEYS.map((day, index) => {
                        const isDaySelected = draft.days.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(draft, day)}
                            className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xs font-bold transition ${
                              isDaySelected
                                ? 'app-primary-bg app-on-primary shadow-md'
                                : 'border app-border-color app-surface app-text-muted hover-app-surface-subtle'
                            }`}
                          >
                            {DAY_SHORT_VI[index]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions inside accordion */}
                  <div className="mt-4 flex items-center justify-between pt-2 border-t app-border-color">
                    <button
                      type="button"
                      onClick={() => {
                        setDrafts((items) => items.filter((item) => item.key !== draft.key));
                        setActiveKey(null);
                        setDirty(true);
                      }}
                      className="rounded-xl px-3 py-2 text-xs font-bold app-red-text hover-app-red-soft"
                    >
                      Xóa hoạt động
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveKey(null)}
                      className="rounded-xl app-strong-bg app-on-strong px-5 py-2 text-xs font-bold hover-app-strong-bg"
                    >
                      Xong
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {drafts.length === 0 && (
          <button
            type="button"
            onClick={addActivity}
            className="flex flex-col items-center justify-center rounded-[24px] border-2 border-dashed app-border-color app-surface p-8 text-center text-sm font-bold app-primary-text hover-app-surface-subtle"
          >
            <MaterialIcon name="add" className="mb-1 text-3xl" />
            <span>Chưa có hoạt động nào</span>
            <small className="text-xs app-text-muted font-normal mt-1">
              Bấm vào đây để thêm hoạt động đầu tiên cho {data.child.full_name || 'bé'}
            </small>
          </button>
        )}
      </div>

      {/* Validation Error Banner */}
      {(validationError || error) && (
        <div className="mt-4 rounded-2xl border app-red-border app-red-soft p-3 text-xs font-semibold app-red-text">
          {validationError ?? error}
        </div>
      )}

      {/* FLOATING BOTTOM SAVE BAR */}
      <div className="fixed bottom-3 left-1/2 z-20 w-[calc(100%-24px)] max-w-[436px] -translate-x-1/2 rounded-[24px] border app-border-color app-nav-surface p-2 shadow-2xl backdrop-blur">
        <button
          disabled={saving || !dirty}
          onClick={() => void save().catch(() => undefined)}
          className="w-full rounded-[18px] app-primary-bg py-4 text-sm font-black app-on-primary shadow-md transition hover-app-primary-bg disabled:opacity-40"
        >
          {saving ? 'Đang lưu vào hệ thống…' : dirty ? 'Lưu thay đổi thời khóa biểu' : 'Đã cập nhật'}
        </button>
      </div>

      {/* Discard Changes Modal */}
      {showDiscard && (
        <div className="app-modal-overlay fixed inset-0 z-30 flex items-end justify-center p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-[400px] rounded-[28px] app-surface p-5 shadow-2xl">
            <b className="block text-base font-extrabold app-text-color">Bỏ các thay đổi chưa lưu?</b>
            <p className="my-3 text-xs leading-relaxed app-text-muted">
              Những điều chỉnh thời khóa biểu bạn vừa thực hiện sẽ không được lưu vào hệ thống.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDiscard(false)}
                className="flex-1 rounded-2xl app-surface-muted py-3 text-xs font-bold app-text-muted"
              >
                Ở lại chỉnh sửa
              </button>
              <button
                onClick={onBack}
                className="flex-1 rounded-2xl app-red-solid app-on-danger py-3 text-xs font-bold shadow-sm"
              >
                Bỏ thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-bold app-text-muted">
      <span className="mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}
