import React from 'react';

export function StatusBadge({ status, label }: { status: 'success' | 'warning' | 'info' | 'danger', label: string }) {
  const map = {
    success: 'app-green-soft app-green-text',
    warning: 'app-yellow-soft app-yellow-text',
    info: 'app-blue-soft app-primary-text',
    danger: 'app-red-soft app-red-text'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${map[status] || map.info}`}>
      {label}
    </span>
  );
}

export function SubjectChip({ subject, time }: { subject: string, time: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-2xl app-surface-subtle border app-border-color">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl app-blue-soft app-primary-text flex items-center justify-center font-bold text-sm">
          {subject.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <b className="text-sm">{subject}</b>
          <small className="block app-text-muted text-xs">{time}</small>
        </div>
      </div>
      <StatusBadge status="info" label="Scheduled" />
    </div>
  );
}
