import { useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { GRADE_LEVEL_OPTIONS, normalizeGradeLevel } from '../domain/education';
import {
  contextFromAccountChild,
  type AccountChild,
} from '../hooks/useAccountChildren';
import { persistFamilyContext, type FamilyContext } from '../lib/familyIdentity';
import { AppDropdown } from './AppDropdown';
import { AppLogo } from './AppLogo';
import { ChildAvatar } from './ChildAvatar';
import { MaterialIcon } from './MaterialIcon';
import { ThemeToggle } from './ThemeToggle';

interface ChildSelectionScreenProps {
  user: User;
  children: AccountChild[];
  childrenError: string | null;
  onChildSelected: (context: FamilyContext) => void;
  onAddChild: (childName: string, gradeLevel: number) => Promise<AccountChild>;
  onLogout: () => Promise<void>;
}

export function ChildSelectionScreen({
  user,
  children,
  childrenError,
  onChildSelected,
  onAddChild,
  onLogout,
}: ChildSelectionScreenProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [childName, setChildName] = useState('');
  const [gradeLevel, setGradeLevel] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showCreateForm = children.length === 0 || isCreating;

  const selectChild = (child: AccountChild) => {
    const context = contextFromAccountChild(child);
    if (!context) {
      setError('Hồ sơ của bé không hợp lệ. Vui lòng tải lại trang.');
      return;
    }
    persistFamilyContext(user.id, context);
    onChildSelected(context);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const name = childName.trim();
    const grade = normalizeGradeLevel(gradeLevel);
    if (name.length < 2 || !grade) return;
    setLoading(true);
    setError(null);

    try {
      const child = await onAddChild(name, grade);
      selectChild(child);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thêm được hồ sơ con.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen app-background p-5 app-text-color">
      <div className="mx-auto max-w-md">
        <header className="child-selection-header mb-8 flex items-center justify-between">
          <div className="child-selection-account flex items-center gap-3">
            <AppLogo className="h-10 w-10" />
            <div className="child-selection-account-copy">
              <b>genAi Family</b>
              <small className="block text-xs app-text-muted">{user.email}</small>
            </div>
          </div>
          <div className="child-selection-actions flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => void onLogout()} className="child-selection-logout text-xs font-bold app-primary-text">
              Đăng xuất
            </button>
          </div>
        </header>

        {children.length > 0 && !showCreateForm ? (
          <section>
            <h1 className="mb-2 text-3xl font-extrabold">Chọn con</h1>
            <p className="mb-5 text-sm app-text-muted">Mỗi bé có lịch học và tiến độ riêng.</p>
            <div className="grid gap-3">
              {children.map((child) => (
                <button
                  key={child.child_profile_id}
                  onClick={() => selectChild(child)}
                  className="rounded-[24px] border app-border-color app-surface p-4 text-left shadow-sm transition hover-app-primary-border"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="child-selection-profile">
                      <ChildAvatar className="child-selection-avatar" name={child.child_name} avatarPath={child.child_avatar_url} />
                      <span>
                      <b className="block text-sm">{child.child_name || 'Bé'}</b>
                      <small className="text-xs app-text-muted">
                        {child.child_grade_level ? `Lớp ${child.child_grade_level} · ` : ''}Mở lịch và tiến độ
                      </small>
                      </span>
                    </span>
                    <MaterialIcon name="chevron_right" className="text-xl app-primary-text" />
                  </span>
                </button>
              ))}
            </div>
            {(error || childrenError) ? (
              <p className="mt-3 rounded-2xl app-yellow-soft p-3 text-xs app-yellow-text">
                {error ?? childrenError}
              </p>
            ) : null}
            <button
              onClick={() => setIsCreating(true)}
              className="mt-4 w-full rounded-2xl app-primary-bg py-3 text-sm font-bold app-on-primary shadow-sm"
            >
              <span className="inline-flex items-center gap-1">
                <MaterialIcon name="person_add" className="text-base" />
                Thêm con
              </span>
            </button>
          </section>
        ) : null}

        {showCreateForm ? (
          <section className="rounded-[28px] border app-border-color app-surface p-6 shadow-lg">
            <h1 className="mb-1 text-2xl font-extrabold">{children.length > 0 ? 'Thêm con' : 'Tạo hồ sơ cho con'}</h1>
            <p className="mb-5 text-sm app-text-muted">
              Lịch học, mục tiêu và tiến độ sẽ được lưu riêng cho bé này.
            </p>
            <form onSubmit={handleCreate} className="grid gap-4">
              <label className="text-xs font-bold app-text-muted">
                Tên bé / học sinh
                <input
                  value={childName}
                  onChange={(event) => setChildName(event.target.value)}
                  placeholder="VD: Bé Bảo An"
                  minLength={2}
                  maxLength={100}
                  required
                  autoFocus
                  className="gemini-control mt-2 h-12 w-full rounded-2xl border app-border-color app-surface-muted px-4 text-sm app-text-color"
                />
              </label>
              <div className="text-xs font-bold app-text-muted">
                <span className="app-field-label">Lớp đang học</span>
                <AppDropdown
                  ariaLabel="Lớp đang học"
                  placeholder="Chọn lớp hiện tại"
                  value={gradeLevel ? String(gradeLevel) : ''}
                  onChange={(value) => setGradeLevel(value ? Number(value) : '')}
                  options={GRADE_LEVEL_OPTIONS.map((grade) => ({
                    value: String(grade),
                    label: `Lớp ${grade}`,
                    icon: 'school',
                  }))}
                />
              </div>
              {(error || childrenError) ? (
                <p className="rounded-2xl app-yellow-soft p-3 text-xs app-yellow-text">
                  {error ?? childrenError}
                </p>
              ) : null}
              <div className="flex gap-2">
                {children.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 rounded-2xl app-surface-muted py-3 text-sm font-bold"
                  >
                    Hủy
                  </button>
                ) : null}
                <button
                  disabled={loading || childName.trim().length < 2 || !normalizeGradeLevel(gradeLevel)}
                  className="flex-1 rounded-2xl app-primary-bg py-3 text-sm font-bold app-on-primary disabled:opacity-60"
                >
                  {loading ? 'Đang lưu…' : 'Lưu hồ sơ'}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
