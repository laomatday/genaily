export type StudyLockStatus =
  | 'disabled'
  | 'preparing'
  | 'queued'
  | 'processing'
  | 'sent'
  | 'acknowledged'
  | 'failed'
  | 'configuration_required';

export type StudyLockTone = 'neutral' | 'pending' | 'success' | 'error';

export interface StudyLockPresentation {
  status: StudyLockStatus;
  label: string;
  detail: string;
  tone: StudyLockTone;
  confirmed: boolean;
}

const lockPresentation: Record<StudyLockStatus, Omit<StudyLockPresentation, 'status'>> = {
  disabled: {
    label: 'Không dùng Khóa tập trung',
    detail: 'Buổi học này vẫn được ghi nhận nhưng không gửi lệnh khóa tới thiết bị.',
    tone: 'neutral',
    confirmed: false,
  },
  preparing: {
    label: 'Đang chuẩn bị lệnh khóa',
    detail: 'Hệ thống đang tạo lệnh dành cho thiết bị của con.',
    tone: 'pending',
    confirmed: false,
  },
  queued: {
    label: 'Đang chờ gửi tới thiết bị',
    detail: 'Lệnh đã được lưu và sẽ gửi ngay khi thiết bị kết nối.',
    tone: 'pending',
    confirmed: false,
  },
  processing: {
    label: 'Đang kết nối thiết bị',
    detail: 'Hệ thống đang chuyển lệnh khóa tới thiết bị của con.',
    tone: 'pending',
    confirmed: false,
  },
  sent: {
    label: 'Đã gửi, chờ thiết bị xác nhận',
    detail: 'Thiết bị chưa xác nhận đã áp dụng Khóa tập trung.',
    tone: 'pending',
    confirmed: false,
  },
  acknowledged: {
    label: 'Thiết bị đã xác nhận khóa',
    detail: 'Khóa tập trung đang hoạt động trên thiết bị đã ghép nối.',
    tone: 'success',
    confirmed: true,
  },
  failed: {
    label: 'Không khóa được thiết bị',
    detail: 'Buổi học vẫn có thể tiếp tục, nhưng thiết bị chưa được khóa.',
    tone: 'error',
    confirmed: false,
  },
  configuration_required: {
    label: 'Thiết bị chưa sẵn sàng',
    detail: 'Ba/mẹ cần hoàn tất ghép nối hoặc cấp quyền trên thiết bị.',
    tone: 'error',
    confirmed: false,
  },
};

export function resolveStudyLockState(
  enabled: boolean,
  commandStatus?: string | null,
): StudyLockPresentation {
  if (!enabled) return { status: 'disabled', ...lockPresentation.disabled };

  const status = commandStatus && commandStatus in lockPresentation
    ? commandStatus as StudyLockStatus
    : 'preparing';

  return { status, ...lockPresentation[status] };
}

export function studyLockStartLabel(state: StudyLockPresentation): string {
  if (state.confirmed) return 'Bắt đầu tập trung';
  if (state.tone === 'error') return 'Tiếp tục học không khóa';
  return 'Bắt đầu trong khi chờ khóa';
}
