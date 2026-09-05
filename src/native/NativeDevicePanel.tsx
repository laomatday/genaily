import { useState } from 'react';
import type { FamilyContext } from '../lib/familyIdentity';
import { isBoundTo, nativeStudyLock } from './studyLock';
import { useNativeDevice } from './useNativeDevice';

export function NativeDevicePanel({ context, role, onSetup }: {
  context: FamilyContext; role: 'parent' | 'child'; onSetup: () => void;
}) {
  const { status, error } = useNativeDevice();
  const [message, setMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const bound = status !== null && isBoundTo(status, context);
  const label = !bound ? 'Cần ba/mẹ thiết lập máy này'
    : !status?.accessibilityEnabled || status.selectedAppCount === 0 ? 'Chưa đủ quyền bảo vệ'
    : !status.serverVerified ? 'Chưa xác nhận kết nối'
    : status.lockActive ? 'Đang hạn chế ứng dụng đã chọn' : 'Đã kết nối · Study Lock sẵn sàng';
  const diagnose = async () => {
    setChecking(true);
    try { setMessage((await nativeStudyLock.diagnose()).message); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Không kiểm tra được kết nối.'); }
    finally { setChecking(false); }
  };
  return <details className="native-device-panel">
    <summary>Study Lock · {label}</summary>
    <div>
      <p>{status?.lastHeartbeat ? `Máy chủ xác nhận lúc ${new Date(status.lastHeartbeat).toLocaleTimeString('vi-VN')}.` : 'Chưa có heartbeat từ máy chủ.'}</p>
      <p>Phạm vi Pilot: {status?.selectedAppCount ?? 0} ứng dụng được chọn; không phải khóa toàn bộ điện thoại.</p>
      {(error || status?.error) ? <p role="alert">{error || status?.error}</p> : null}
      <div className="native-actions">
        <button className="secondary-action" type="button" onClick={onSetup}>
          {role === 'parent' ? 'Thiết lập máy này' : 'Nhờ ba/mẹ thiết lập'}
        </button>
        <button className="secondary-action" type="button" disabled={checking} onClick={() => void diagnose()}>
          {checking ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </div>
  </details>;
}
