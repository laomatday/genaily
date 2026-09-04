import type { SessionStatus } from '../types';

export const UI_COPY = Object.freeze({
  parent: 'Ba/mẹ',
  parentLowercase: 'ba/mẹ',
  childFallback: 'Bé',
});

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  scheduled: 'Sắp học',
  in_progress: 'Đang học',
  awaiting_parent: 'Chờ ba/mẹ duyệt',
  approved: 'Đã duyệt',
  completed: 'Hoàn thành',
  rejected: 'Cần làm lại',
  cancelled: 'Đã hủy',
};

export const EXCEPTION_SEVERITY_LABEL: Record<string, string> = {
  low: 'Theo dõi',
  medium: 'Cần lưu ý',
  high: 'Ưu tiên xử lý',
  critical: 'Khẩn cấp',
};

export const DEVICE_COMMAND_STATUS_LABEL: Record<string, string> = {
  queued: 'Đang xếp hàng',
  processing: 'Đang gửi',
  sent: 'Đã gửi, chờ thiết bị',
  acknowledged: 'Thiết bị đã xác nhận',
  failed: 'Gửi thất bại',
  configuration_required: 'Cần cấu hình thiết bị',
  expired: 'Đã hết hạn',
};

export function sessionStatusLabel(status: string): string {
  return SESSION_STATUS_LABEL[status as SessionStatus] ?? 'Chưa xác định';
}

export function exceptionSeverityLabel(severity: string): string {
  return EXCEPTION_SEVERITY_LABEL[severity] ?? 'Cần lưu ý';
}
