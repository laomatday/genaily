import { useState } from 'react';
import { AppLogo } from '../components/AppLogo';
import { MaterialIcon } from '../components/MaterialIcon';
import type { FamilyContext } from '../lib/familyIdentity';
import { isBoundTo, isReadyForChild, nativeStudyLock } from './studyLock';
import { useNativeDevice } from './useNativeDevice';

interface Props {
  context: FamilyContext;
  childName: string;
  onComplete: () => Promise<void>;
  onBack: () => void;
}
export function NativeSetupScreen({ context, childName, onComplete, onBack }: Props) {
  const { status, error: statusError, refresh } = useNativeDevice();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bound = status !== null && isBoundTo(status, context);
  const ready = status !== null && isReadyForChild(status, context);
  const wrongChild = Boolean(status?.paired && !bound);
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await operation(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa hoàn tất thiết lập. Hãy thử lại.'); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    const current = await refresh();
    if (!current || !isReadyForChild(current, context)) {
      throw new Error('Hãy hoàn tất kết nối, quyền Trợ năng và chọn ứng dụng trước khi giao máy cho con.');
    }
    await onComplete();
  };
  return <main className="entry-mode-screen app-background app-text-color native-setup-screen">
    <div className="entry-mode-shell">
      <header className="entry-mode-header"><AppLogo /><b>genaily · Thiết lập máy của con</b></header>
      <section className="entry-mode-card" aria-busy={busy}>
        <span className="entry-mode-eyebrow"><MaterialIcon name="shield" />Ba/mẹ thiết lập một lần</span>
        <h1>Kết nối máy này với {childName}</h1>
        <p>Giao diện học và Study Lock nằm trong cùng một ứng dụng. Không cần cài thêm companion.</p>
        <div className="native-setup-steps">
          <section><h2>1. Kết nối đúng hồ sơ</h2>
            <p>{bound ? 'Đã kết nối với hồ sơ này.' : 'Máy chủ xác nhận quyền ba/mẹ rồi ghép thiết bị tự động.'}</p>
            <button className="primary-action" type="button" disabled={busy || bound || wrongChild || !status}
              onClick={() => void run(() => nativeStudyLock.provision(context))}>
              {bound ? 'Đã kết nối' : 'Kết nối thiết bị này'}
            </button>
            {wrongChild ? <p role="alert">Máy đang gắn với hồ sơ khác hoặc bản companion cũ. Ba/mẹ thu hồi thiết bị cũ trên web, mở lại app rồi thiết lập lại; không tự chuyển hồ sơ khi đang khóa.</p> : null}
          </section>
          <section><h2>2. Cho phép Study Lock</h2>
            <p>Quyền Trợ năng chỉ nhận tên ứng dụng đang mở để hiển thị màn chắn. genaily không đọc nội dung màn hình, mật khẩu hay tin nhắn.</p>
            <label className="native-consent"><input type="checkbox" checked={consent}
              onChange={event => setConsent(event.target.checked)} disabled={busy} />
              <span>Tôi là phụ huynh và đồng ý bật quyền này trên máy của con.</span></label>
            <button className="secondary-action" type="button" disabled={busy || !bound || !consent}
              onClick={() => void run(() => nativeStudyLock.permissions())}>Mở cài đặt Trợ năng</button>
            <p>{status?.accessibilityEnabled ? 'Quyền Trợ năng đã bật.' : 'Tìm genaily Study Lock và bật quyền, sau đó quay lại đây.'}</p>
          </section>
          <section><h2>3. Chọn ứng dụng cần hạn chế</h2>
            <p>Giữ ứng dụng học tập và liên lạc khẩn cấp. Chỉ phiên ba/mẹ được đổi danh sách.</p>
            <button className="secondary-action" type="button" disabled={busy || !bound}
              onClick={() => void run(() => nativeStudyLock.chooseApps())}>Chọn ứng dụng</button>
            <p>Đã chọn: {status?.selectedAppCount ?? 0} ứng dụng.</p>
          </section>
        </div>
        <p className="native-limits">Bản Pilot hạn chế các ứng dụng đã chọn, chưa khóa toàn bộ điện thoại như thiết bị được quản trị. Mất kết nối quá thời hạn an toàn có thể bỏ chặn.</p>
        {(error || statusError) ? <p className="entry-mode-error" role="alert">{error || statusError}</p> : null}
        <div className="native-actions">
          <button className="secondary-action" type="button" disabled={busy} onClick={onBack}>Quay lại</button>
          <button className="primary-action" type="button" disabled={busy || !ready}
            onClick={() => void run(complete)}>{busy ? 'Đang xác nhận…' : 'Hoàn tất · Vào Góc của con'}</button>
        </div>
      </section>
    </div>
  </main>;
}
