import { useState, type FormEvent } from 'react';
import type { AuthState } from '../hooks/useAuth';
import { AppLogo } from './AppLogo';
import { MaterialIcon } from './MaterialIcon';
import { ThemeToggle } from './ThemeToggle';

interface AuthScreenProps {
  auth: AuthState;
  onAuthSuccess: () => void;
}

export function AuthScreen({ auth, onAuthSuccess }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (!fullName) throw new Error('Vui lòng nhập tên của bạn');
        const result = await auth.signUp(email, password, fullName);
        if (result === 'confirmation_required') {
          setNotice('Tài khoản đã tạo. Hãy xác nhận email rồi đăng nhập.');
          setIsSignUp(false);
          return;
        }
      } else {
        await auth.signIn(email, password);
      }
      onAuthSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      if (msg.toLowerCase().includes('database error saving new user')) {
        setError('Lỗi cơ sở dữ liệu khi tạo người dùng (Trigger database Supabase). Vui lòng kiểm tra lại trigger handle_new_user hoặc quyền trên bảng profiles trong Supabase SQL Editor.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br app-gradient-blue-start app-gradient-background-mid app-gradient-green-end flex items-center justify-center p-4">
      <div className="theme-floating-control"><ThemeToggle /></div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <AppLogo className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">genAi Family</h1>
          <p className="text-sm app-text-muted">Hệ thống học tập</p>
        </div>

        <div className="auth-card app-surface rounded-[28px] p-8 shadow-lg border app-border-color">
          {!auth.isConfigured && (
            <div className="mb-6 p-4 rounded-2xl app-yellow-soft border app-yellow-border app-yellow-text text-xs leading-relaxed">
              <div className="font-bold flex items-center gap-1.5 mb-1 app-yellow-text">
                <MaterialIcon name="warning" className="text-base" />
                <span>Chưa cấu hình Supabase</span>
              </div>
              <p>
                Để kích hoạt kết nối đám mây, vui lòng thêm <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> vào biến môi trường hoặc file cấu hình.
              </p>
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-xl font-bold mb-2">
              {isSignUp ? 'Tạo tài khoản' : 'Đăng nhập'}
            </h2>
            <p className="text-sm app-text-muted">
              {isSignUp
                ? 'Đăng ký để bắt đầu quản lý lịch học cho con'
                : 'Đăng nhập bằng email và mật khẩu'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="auth-full-name" className="text-xs app-text-muted font-bold block mb-2">Tên của bạn</label>
                <input
                  id="auth-full-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  disabled={loading}
                  className="gemini-control w-full h-12 app-surface-muted rounded-2xl px-4 border app-border-color text-sm disabled:opacity-50"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="text-xs app-text-muted font-bold block mb-2">Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={loading}
                className="gemini-control w-full h-12 app-surface-muted rounded-2xl px-4 border app-border-color text-sm disabled:opacity-50"
                required
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="text-xs app-text-muted font-bold block mb-2">Mật khẩu</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="gemini-control w-full h-12 app-surface-muted rounded-2xl px-4 border app-border-color text-sm disabled:opacity-50"
                required
              />
            </div>

            {notice ? (
              <div role="status" className="p-3 rounded-2xl app-green-soft border app-green-border text-sm app-green-text">
                {notice}
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="p-3 rounded-2xl app-yellow-soft border app-yellow-border text-sm app-yellow-text">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl app-primary-bg app-on-primary font-bold text-sm mt-6 shadow-md disabled:opacity-60"
            >
              {loading ? 'Đang xử lý…' : isSignUp ? 'Tạo tài khoản' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs app-text-muted mb-3">
              {isSignUp ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}
            </p>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setNotice(null);
              }}
              className="text-sm font-bold app-primary-text hover:underline"
            >
              {isSignUp ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </div>
        </div>

        <p className="text-xs text-center app-text-muted mt-6">Mỗi tài khoản quản lý nhiều hồ sơ con, với dữ liệu được bảo vệ bằng RLS.</p>
      </div>
    </div>
  );
}
