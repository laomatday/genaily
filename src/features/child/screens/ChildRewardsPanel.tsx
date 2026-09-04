import { MaterialIcon } from '../../../components/MaterialIcon';
import { experienceSummary, milestoneProgress } from '../../../domain/engagement';
import type { FamilyData } from '../../../lib/familyRepository';

export function ChildRewardsPanel({ data, saving, onRedeem, onOpenMenu }: {
  data: FamilyData;
  saving: boolean;
  onRedeem: (milestoneId: string) => Promise<void>;
  onOpenMenu: () => void;
}) {
  const experience = experienceSummary(data.child.experience_points, data.settings);
  const milestone = data.milestones.find((item) => ['active', 'unlocked'].includes(item.status));
  const history = data.milestones.filter((item) => ['redeemed', 'archived'].includes(item.status));
  const progress = milestone ? milestoneProgress(milestone, experience.points) : 0;

  return (
    <section className="child-dashboard-panel">
      <header className="screen-intro screen-intro-with-action">
        <div><span className="screen-eyebrow">Kho phần thưởng</span><h1>Đổi nỗ lực thành niềm vui</h1><p>XP được cộng trên máy chủ sau khi buổi học được duyệt.</p></div>
        <button type="button" onClick={onOpenMenu} className="header-icon-button" aria-label="Mở menu tài khoản"><MaterialIcon name="menu" /></button>
      </header>

      <article className="experience-hero">
        <span className="experience-level-icon"><MaterialIcon name="stars" /></span>
        <div><small>Cấp {experience.level}</small><h2>{experience.points.toLocaleString('vi-VN')} XP</h2><p>Còn {experience.pointsToNextLevel} XP để lên cấp tiếp theo.</p></div>
        <progress className="dashboard-progress" value={experience.progress} max={100} aria-label={`Tiến độ cấp ${experience.level}: ${experience.progress}%`} />
      </article>

      <section className="dashboard-section" aria-labelledby="current-reward-title">
        <div className="section-heading-row"><div><h2 id="current-reward-title">Mục tiêu gia đình</h2></div></div>
        {milestone ? (
          <article className="child-reward-card">
            <span className="milestone-card-icon"><MaterialIcon name="redeem" /></span>
            <div><span className="screen-eyebrow">{milestone.status === 'unlocked' ? 'Đã mở khóa' : 'Đang tích lũy'}</span><h3>{milestone.title}</h3>{milestone.description ? <p>{milestone.description}</p> : null}</div>
            <div className="milestone-progress-copy"><span>{experience.points - milestone.starting_points}/{milestone.target_points} XP</span><b>{progress}%</b></div>
            <progress className="dashboard-progress" value={progress} max={100} aria-label={`Tiến độ phần thưởng ${progress}%`} />
            {milestone.status === 'unlocked' ? <button type="button" className="primary-action" disabled={saving} onClick={() => void onRedeem(milestone.id).catch(() => undefined)}><MaterialIcon name="redeem" />{saving ? 'Đang nhận…' : 'Nhận phần thưởng'}</button> : null}
          </article>
        ) : <p className="empty-card">Ba/mẹ chưa thiết lập phần thưởng mới.</p>}
      </section>

      {history.length > 0 ? <section className="dashboard-section"><div className="section-heading-row"><div><h2>Đã hoàn thành</h2></div></div><div className="dashboard-stack">{history.map((item) => <article key={item.id} className="reward-history-item"><MaterialIcon name="workspace_premium" /><span><b>{item.title}</b><small>{item.status === 'redeemed' ? 'Đã nhận thưởng' : 'Đã lưu trữ'}</small></span></article>)}</div></section> : null}
    </section>
  );
}
