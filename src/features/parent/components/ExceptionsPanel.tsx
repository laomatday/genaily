import type { FamilyData } from '../../../lib/familyRepository';

export function ExceptionsPanel({ data }: { data: FamilyData }) {
  const childName = data.child.full_name || 'Bé';
  const open = data.exceptions.filter((item) => item.status === 'open');
  return (
    <section>
      <h1 className="mb-1 text-2xl font-extrabold app-text-color">Ngoại lệ của {childName}</h1>
      <p className="mb-5 text-sm app-text-muted">Các yêu cầu nghỉ và vấn đề phát sinh của {childName} được đồng bộ realtime.</p>
      <div className="grid gap-3">
        {open.map((item) => (
          <article key={item.id} className="rounded-[24px] border app-yellow-border app-yellow-soft p-4">
            <div className="mb-2 flex justify-between gap-3"><b className="text-sm">{item.title}</b><span className="text-[10px] font-bold uppercase app-yellow-text">{item.severity}</span></div>
            <p className="text-xs leading-relaxed app-yellow-text">{item.description}</p>
            <p className="mt-3 border-t app-yellow-border pt-3 text-xs font-bold">{item.recommended_action}</p>
          </article>
        ))}
        {open.length === 0 && <p className="rounded-2xl app-surface p-5 text-center text-xs app-text-muted">Không có ngoại lệ đang mở.</p>}
      </div>
    </section>
  );
}
