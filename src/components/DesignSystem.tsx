import React from 'react';

export function StatusBadge({ status, label }: { status: 'success' | 'warning' | 'info' | 'danger', label: string }) {
  const map = {
    success: 'bg-[#E8F8F4] text-[#0D8A79]',
    warning: 'bg-[#FFF4D8] text-[#9A6800]',
    info: 'bg-[#EEF3FF] text-[#243C8F]',
    danger: 'bg-[#FFECEA] text-[#C94444]'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${map[status] || map.info}`}>
      {label}
    </span>
  );
}

export function SubjectChip({ subject, time }: { subject: string, time: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-2xl bg-[#F8F9FC] border border-[#E9EDF4]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#EAF2FF] text-[#243C8F] flex items-center justify-center font-bold text-sm">
          {subject.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <b className="text-sm">{subject}</b>
          <small className="block text-[#7B8496] text-xs">{time}</small>
        </div>
      </div>
      <StatusBadge status="info" label="Scheduled" />
    </div>
  );
}
