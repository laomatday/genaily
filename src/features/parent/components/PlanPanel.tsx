import { MaterialIcon } from '../../../components/MaterialIcon';
import { calculateDayLoads, parseSmartWeekOutput } from '../../../domain/plannerService';
import { completionPercent } from '../../../domain/progressMetrics';
import { experienceSummary, milestoneProgress } from '../../../domain/engagement';
import type { FamilyData } from '../../../lib/familyRepository';

interface PlanPanelProps {
  data: FamilyData;
  saving: boolean;
  onAddGoal: () => void;
  onGenerate: () => Promise<void>;
  onApply: () => Promise<void>;
  onEditMilestone: () => void;
}

const planStatusLabel: Record<string, string> = {
  draft: 'Bản nháp',
  proposed: 'Chờ áp dụng',
  executed: 'Đã áp dụng',
  failed: 'Có lỗi',
};

export function PlanPanel({ data, saving, onAddGoal, onGenerate, onApply, onEditMilestone }: PlanPanelProps) {
  const plan = data.aiPlan;
  const loads = calculateDayLoads(data.schedule);
  const restDays = loads.filter((load) => load.minutes === 0).length;
  const heaviestDay = [...loads].sort((left, right) => right.minutes - left.minutes)[0];
  const goalStats = data.goals.map((goal) => {
    const scheduled = data.schedule
      .filter((event) => event.subject === goal.subject)
      .reduce((sum, event) => sum + event.duration_minutes, 0);
    return { goal, scheduled, percent: completionPercent(scheduled, goal.target_minutes) };
  });
  const totalTarget = data.goals.reduce((sum, goal) => sum + goal.target_minutes, 0);
  const totalScheduled = goalStats.reduce((sum, item) => sum + Math.min(item.scheduled, item.goal.target_minutes), 0);
  const overallProgress = completionPercent(totalScheduled, totalTarget);
  const experience = experienceSummary(data.child.experience_points, data.settings);
  const milestone = data.milestones.find((item) => ['active', 'unlocked'].includes(item.status));
  const rewardProgress = milestone ? milestoneProgress(milestone, experience.points) : 0;
  const currentMonth = new Date().getMonth() + 1;
  const semester = currentMonth >= 8 || currentMonth <= 1 ? 1 : 2;

  let summary = 'Chưa có kế hoạch AI. Smart Week sẽ cân đối lịch hiện tại với mục tiêu đã đặt.';
  let warnings: string[] = [];
  let updateCount = 0;
  if (plan) {
    try {
      const output = parseSmartWeekOutput(plan.output_json);
      summary = output.summary || plan.input_summary || summary;
      warnings = output.warnings;
      updateCount = output.schedule_updates.length;
    } catch {
      summary = 'Kế hoạch gần nhất có định dạng cũ; hãy tạo lại bằng Gemini.';
    }
  }

  return (
    <section className="dashboard-panel">
      <header className="screen-intro screen-intro-with-action">
        <div>
          <span className="screen-eyebrow">Định hướng tuần</span>
          <h1>Mục tiêu & Kế hoạch học tập</h1>
          <p>Lớp {data.child.grade_level ?? '—'} · Học kỳ {semester}</p>
        </div>
        <button type="button" onClick={onAddGoal} aria-label="Thêm mục tiêu" className="round-primary-button">
          <MaterialIcon name="add" />
        </button>
      </header>

      <article className="smart-week-hero">
        <div className="smart-week-heading">
          <span className="smart-week-icon"><MaterialIcon name="auto_awesome" filled /></span>
          <div><span className="screen-eyebrow">Nhịp học thông minh AI</span><h2>Bộ lập kế hoạch học tập thích ứng</h2></div>
          {plan ? <span className="plan-status">{planStatusLabel[plan.status] ?? plan.status}</span> : null}
        </div>
        <p>{summary}</p>
        {warnings.length > 0 ? (
          <ul className="plan-warning-list">
            {warnings.map((warning) => <li key={warning}><MaterialIcon name="warning" />{warning}</li>)}
          </ul>
        ) : null}
        {plan ? <p className="plan-update-count">{updateCount} thay đổi đang có trong đề xuất.</p> : null}
        <div className="smart-week-actions">
          <button type="button" disabled={saving} className="secondary-action" onClick={() => void onGenerate().catch(() => undefined)}>
            <MaterialIcon name="auto_awesome" /> {saving ? 'Đang xử lý…' : plan ? 'Tạo lại kế hoạch' : 'Tạo kế hoạch'}
          </button>
          <button
            type="button"
            disabled={saving || !plan || plan.status === 'executed' || updateCount === 0}
            className="primary-action"
            onClick={() => void onApply().catch(() => undefined)}
          >
            <MaterialIcon name="check_circle" /> Áp dụng tuần này
          </button>
        </div>
      </article>

      <article className="goal-overview-card">
        <div className="goal-overview-copy">
          <span className="screen-eyebrow">Mục tiêu tuần</span>
          <h2>{overallProgress}% đã được xếp lịch</h2>
          <p>{totalScheduled}/{totalTarget} phút trong {data.goals.length} mục tiêu</p>
        </div>
        <div className="goal-overview-progress-wrap">
          <strong>{overallProgress}%</strong>
          <progress className="goal-overview-progress" value={overallProgress} max={100} aria-label={`Mục tiêu tuần đã được xếp lịch ${overallProgress}%`} />
        </div>
      </article>

      <section className="dashboard-section" aria-labelledby="goal-list-title">
        <div className="section-heading-row">
          <div><span className="screen-eyebrow">Tiến độ</span><h2 id="goal-list-title">Mục tiêu học tập</h2></div>
          <button type="button" className="section-text-button" onClick={onAddGoal}>+ Thêm</button>
        </div>
        <div className="dashboard-stack">
          {goalStats.map(({ goal, scheduled, percent }, index) => (
            <article key={goal.id} className="goal-progress-card">
              <span className={`goal-subject-mark subject-swatch-${index % 8}`}>{goal.subject.trim().charAt(0).toUpperCase()}</span>
              <div>
                <div className="goal-progress-heading"><b>{goal.subject}</b><strong>{scheduled}/{goal.target_minutes}'</strong></div>
                <p>{goal.description ?? goal.title}</p>
                <progress className="plan-progress" value={percent} max={100} aria-label={`Tiến độ mục tiêu ${goal.subject}: ${percent}%`} />
              </div>
            </article>
          ))}
          {data.goals.length === 0 ? (
            <button type="button" className="schedule-setup-prompt" onClick={onAddGoal}>
              <span><MaterialIcon name="monitoring" /></span>
              <span><b>Chưa có mục tiêu</b><small>Thêm số phút cần học cho từng môn trong tuần.</small></span>
              <MaterialIcon name="chevron_right" />
            </button>
          ) : null}
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="milestone-title">
        <div className="section-heading-row">
          <div><h2 id="milestone-title">Cột mốc & Phần thưởng</h2></div>
          <button type="button" className="section-text-button" onClick={onEditMilestone}>Chỉnh sửa thưởng <MaterialIcon name="chevron_right" /></button>
        </div>
        {milestone ? (
          <article className="milestone-card">
            <span className="milestone-card-icon"><MaterialIcon name="redeem" /></span>
            <div className="milestone-card-copy">
              <span className="screen-eyebrow">Cột mốc tuần</span>
              <h3>{milestone.title}</h3>
              {milestone.description ? <p>{milestone.description}</p> : null}
            </div>
            <div className="milestone-progress-copy"><span>Tiến độ tích lũy</span><b>{rewardProgress}%</b></div>
            <progress className="dashboard-progress" value={rewardProgress} max={100} aria-label={`Tiến độ phần thưởng ${rewardProgress}%`} />
            <small>{milestone.status === 'unlocked' ? 'Đã mở khóa, bé có thể nhận thưởng.' : `Còn ${Math.max(0, milestone.target_points - (experience.points - milestone.starting_points))} XP để mở khóa.`}</small>
          </article>
        ) : (
          <button type="button" className="schedule-setup-prompt" onClick={onEditMilestone}>
            <span><MaterialIcon name="redeem" /></span>
            <span><b>Chưa đặt phần thưởng</b><small>Tạo một cột mốc XP có thật để cả nhà cùng theo dõi.</small></span>
            <MaterialIcon name="chevron_right" />
          </button>
        )}
      </section>

      <section className="dashboard-section" aria-labelledby="balance-title">
        <div className="section-heading-row"><div><span className="screen-eyebrow">Sức học</span><h2 id="balance-title">Cân bằng tuần</h2></div></div>
        <div className="plan-balance-grid">
          <span><MaterialIcon name="calendar_month" /><b>{heaviestDay?.minutes ?? 0}'</b><small>Ngày bận nhất</small></span>
          <span><MaterialIcon name="weekend" /><b>{restDays}</b><small>Ngày chưa có lịch</small></span>
          <span><MaterialIcon name="warning" /><b>{loads.filter((load) => load.level === 'heavy').length}</b><small>Ngày tải cao</small></span>
        </div>
      </section>
    </section>
  );
}
