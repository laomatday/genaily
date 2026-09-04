import { useEffect, useMemo, useState } from 'react';
import { AppDropdown, type AppDropdownOption } from '../../../components/AppDropdown';
import { MaterialIcon } from '../../../components/MaterialIcon';
import { APP_CONFIG } from '../../../config/appConfig';
import { useDialogFocusTrap } from '../../../hooks/useDialogFocusTrap';
import type {
  DevicePairingResult,
  DevicePlatform,
  FamilyData,
  ManagedDeviceRow,
} from '../../../lib/familyRepository';

const platformOptions: readonly AppDropdownOption[] = [
  { value: 'android', label: 'Android', icon: 'android' },
  { value: 'ios', label: 'iPhone / iPad', icon: 'mobile' },
];

const deliveryLabels: Record<string, string> = {
  queued: 'Đang chờ thiết bị',
  delivered: 'Đã nhận lệnh',
  acknowledged: 'Đã áp dụng',
  failed: 'Cần kiểm tra quyền',
  expired: 'Đã hết hạn',
};

function formatPairingCode(value: string): string {
  return value.match(/.{1,4}/g)?.join(' ') ?? value;
}

function platformLabel(platform: string): string {
  return platform === 'android' ? 'Android' : 'iPhone / iPad';
}

function DeviceStatus({ device, now }: { device: ManagedDeviceRow; now: number | null }) {
  if (device.status === 'pairing') return <span className="device-status is-pairing">Chờ ghép</span>;
  const online = now !== null && device.last_seen_at !== null
    && now - new Date(device.last_seen_at).getTime() <= APP_CONFIG.deviceOnlineWindowMs;
  return <span className={`device-status ${online ? 'is-online' : 'is-offline'}`}>{online ? 'Trực tuyến' : 'Ngoại tuyến'}</span>;
}

interface DeviceManagementDialogProps {
  data: FamilyData;
  saving: boolean;
  onCreate: (displayName: string, platform: DevicePlatform) => Promise<DevicePairingResult>;
  onRevoke: (deviceId: string) => Promise<void>;
  onClose: () => void;
}

export function DeviceManagementDialog({ data, saving, onCreate, onRevoke, onClose }: DeviceManagementDialogProps) {
  const dialogRef = useDialogFocusTrap<HTMLDivElement>(true, onClose);
  const [platform, setPlatform] = useState<DevicePlatform>('android');
  const [displayName, setDisplayName] = useState(`${data.child.full_name} · Android`);
  const [pairing, setPairing] = useState<DevicePairingResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleDevices = useMemo(
    () => data.managedDevices.filter((device) => device.status !== 'revoked'),
    [data.managedDevices],
  );

  const selectPlatform = (value: string) => {
    if (value !== 'android' && value !== 'ios') return;
    setPlatform(value);
    setDisplayName(`${data.child.full_name} · ${value === 'android' ? 'Android' : 'iPhone / iPad'}`);
  };

  const createPairing = async () => {
    setLocalError(null);
    try {
      const result = await onCreate(displayName, platform);
      setPairing(result);
      setCopied(false);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Không tạo được mã ghép thiết bị.');
    }
  };

  const copyPairingCode = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.pairingCode);
      setCopied(true);
    } catch {
      setLocalError('Không sao chép tự động được. Hãy nhập mã hiển thị trên màn hình.');
    }
  };

  const revokeDevice = async (deviceId: string) => {
    if (confirmRevokeId !== deviceId) {
      setConfirmRevokeId(deviceId);
      return;
    }
    setLocalError(null);
    try {
      await onRevoke(deviceId);
      setConfirmRevokeId(null);
      if (pairing?.deviceId === deviceId) setPairing(null);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Không thu hồi được thiết bị.');
    }
  };

  return (
    <div className="app-modal-layer device-dialog-layer" role="presentation">
      <button type="button" className="app-modal-backdrop" aria-label="Đóng quản lý thiết bị" onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="app-modal-dialog device-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-dialog-title"
      >
        <div className="app-modal-heading">
          <div><span className="screen-eyebrow">Study Lock</span><b id="device-dialog-title">Thiết bị của {data.child.full_name}</b></div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="modal-close-button"><MaterialIcon name="close" /></button>
        </div>
        <div className="app-modal-content device-dialog-content">
          <section className="device-security-note">
            <span><MaterialIcon name="shield" /></span>
            <div><b>Chỉ chặn ứng dụng gây xao nhãng</b><p>Study Lock không khóa điện thoại, không đọc nội dung và không can thiệp mã PIN của trẻ.</p></div>
          </section>

          <section className="device-section" aria-labelledby="paired-device-title">
            <div className="device-section-heading">
              <h3 id="paired-device-title">Đã ghép</h3>
              <span>{visibleDevices.length} thiết bị</span>
            </div>
            <div className="managed-device-list">
              {visibleDevices.map((device) => {
                const latestDelivery = data.deviceCommandDeliveries.find((delivery) => delivery.device_id === device.id);
                return (
                  <article className="managed-device-card" key={device.id}>
                    <span className="managed-device-icon"><MaterialIcon name={device.platform === 'android' ? 'android' : 'mobile'} /></span>
                    <div className="managed-device-copy">
                      <div><b>{device.display_name}</b><DeviceStatus device={device} now={now} /></div>
                      <small>{platformLabel(device.platform)} · {device.last_seen_at ? `Liên lạc ${new Date(device.last_seen_at).toLocaleString('vi-VN')}` : 'Chưa liên lạc'}</small>
                      {latestDelivery ? <span>{deliveryLabels[latestDelivery.status] ?? latestDelivery.status}</span> : null}
                    </div>
                    <button
                      type="button"
                      className={`device-revoke-button ${confirmRevokeId === device.id ? 'is-confirming' : ''}`}
                      disabled={saving}
                      onClick={() => void revokeDevice(device.id)}
                      aria-label={confirmRevokeId === device.id ? `Xác nhận thu hồi ${device.display_name}` : `Thu hồi ${device.display_name}`}
                    >
                      <MaterialIcon name="delete" />
                      <span className="device-revoke-label">{confirmRevokeId === device.id ? 'Xác nhận' : 'Thu hồi'}</span>
                    </button>
                  </article>
                );
              })}
              {visibleDevices.length === 0 ? (
                <div className="device-empty-state"><MaterialIcon name="devices" /><b>Chưa ghép thiết bị</b><p>Tạo mã bên dưới rồi nhập mã đó trong companion app trên máy của trẻ.</p></div>
              ) : null}
            </div>
          </section>

          <section className="device-section device-pairing-section" aria-labelledby="pair-device-title">
            <div className="device-section-heading"><h3 id="pair-device-title">Ghép thiết bị mới</h3><MaterialIcon name="qr_code" /></div>
            <label className="app-field-label">Nền tảng
              <AppDropdown
                value={platform}
                options={platformOptions}
                placeholder="Chọn nền tảng"
                ariaLabel="Nền tảng thiết bị"
                disabled={saving}
                onChange={selectPlatform}
              />
            </label>
            <label className="app-field-label device-name-label">Tên thiết bị
              <input
                className="gemini-control"
                value={displayName}
                maxLength={80}
                disabled={saving}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            {pairing ? (
              <div className="pairing-code-card" role="status">
                <small>Mã dùng một lần</small>
                <strong>{formatPairingCode(pairing.pairingCode)}</strong>
                <span>Hết hạn lúc {new Date(pairing.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                <button type="button" className="secondary-action" onClick={() => void copyPairingCode()}>
                  <MaterialIcon name={copied ? 'check' : 'content_copy'} />{copied ? 'Đã sao chép' : 'Sao chép mã'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="primary-action device-create-button"
                disabled={saving || !displayName.trim()}
                onClick={() => void createPairing()}
              >
                <MaterialIcon name="add" />{saving ? 'Đang tạo…' : 'Tạo mã ghép'}
              </button>
            )}
            <ol className="device-pairing-steps">
              <li><span>1</span><p>Cài companion app genAi Family trên thiết bị của trẻ.</p></li>
              <li><span>2</span><p>Cấp quyền kiểm soát ứng dụng theo hướng dẫn của Android hoặc iOS.</p></li>
              <li><span>3</span><p>Nhập mã một lần ở trên. Token thiết bị được lưu trong kho bảo mật của hệ điều hành.</p></li>
            </ol>
          </section>

          {localError ? <p className="device-dialog-error" role="alert">{localError}</p> : null}
          <p className="device-failsafe-note"><MaterialIcon name="info" />Nếu mất kết nối, companion app tự bỏ chặn khi hết thời gian an toàn; phụ huynh luôn có thể thu hồi thiết bị tại đây.</p>
        </div>
      </div>
    </div>
  );
}
