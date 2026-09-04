import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MaterialIcon } from './MaterialIcon';

interface ParentGateProps {
  open: boolean;
  accountEmail?: string | null;
  onClose: () => void;
  onVerify: (password: string) => Promise<void>;
}

export function ParentGate({ open, accountEmail, onClose, onVerify }: ParentGateProps) {
  const passwordId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const verifyingRef = useRef(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError(null);
      setVerifying(false);
      verifyingRef.current = false;
      return;
    }

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('drawer-open');
    const focusFrame = window.requestAnimationFrame(() => passwordRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !verifyingRef.current) onClose();
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('drawer-open');
      openerRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError('Vui lòng nhập mật khẩu tài khoản.');
      return;
    }

    setError(null);
    setVerifying(true);
    verifyingRef.current = true;
    try {
      await onVerify(password);
    } catch {
      setError('Không xác minh được. Hãy kiểm tra lại mật khẩu và thử lại.');
      setVerifying(false);
      verifyingRef.current = false;
      window.requestAnimationFrame(() => passwordRef.current?.focus());
    }
  };

  return (
    <div className="parent-gate-layer">
      <button
        type="button"
        className="parent-gate-backdrop"
        aria-label="Đóng xác minh phụ huynh"
        onClick={verifying ? undefined : onClose}
      />
      <section
        ref={dialogRef}
        className="parent-gate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-gate-title"
        aria-describedby="parent-gate-description"
      >
        <div className="parent-gate-icon" aria-hidden="true">
          <MaterialIcon name="lock" />
        </div>
        <h2 id="parent-gate-title">Xác minh phụ huynh</h2>
        <p id="parent-gate-description">
          Nhập mật khẩu tài khoản để mở khu vực quản lý và chỉnh sửa lịch.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="app-field-label" htmlFor={passwordId}>Mật khẩu tài khoản</label>
          <input
            ref={passwordRef}
            id={passwordId}
            className="gemini-control parent-gate-input"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={verifying}
            onChange={(event) => setPassword(event.target.value)}
          />
          {accountEmail ? <small className="parent-gate-account">Tài khoản: {accountEmail}</small> : null}
          {error ? <p className="parent-gate-error" role="alert">{error}</p> : null}

          <div className="parent-gate-actions">
            <button type="button" className="parent-gate-button is-secondary" disabled={verifying} onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="parent-gate-button is-primary" disabled={verifying}>
              {verifying ? 'Đang xác minh…' : 'Mở trang ba/mẹ'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
