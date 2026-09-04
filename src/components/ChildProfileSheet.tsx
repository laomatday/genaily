import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { formatGradeLabel, GRADE_LEVEL_OPTIONS, normalizeGradeLevel } from '../domain/education';
import type { AccountChild } from '../hooks/useAccountChildren';
import { APP_CONFIG } from '../config/appConfig';
import { CHILD_AVATAR_ACCEPT, validateChildAvatarFile } from '../domain/childAvatarPolicy';
import { AppDropdown } from './AppDropdown';
import { ChildAvatar } from './ChildAvatar';
import { MaterialIcon } from './MaterialIcon';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

type ChildAction = 'none' | 'rename' | 'add' | 'clear';

interface ChildProfileSheetProps {
  open: boolean;
  children: AccountChild[];
  selectedChildId: string;
  saving: boolean;
  externalError?: string | null;
  onClose: () => void;
  onSelect: (child: AccountChild) => void;
  onRename: (childName: string, gradeLevel: number, avatarFile?: File | null, removeAvatar?: boolean) => Promise<void>;
  onAdd: (childName: string, gradeLevel: number, avatarFile?: File | null) => Promise<AccountChild>;
  onClearData?: () => Promise<void>;
}

export function ChildProfileSheet({
  open,
  children,
  selectedChildId,
  saving,
  externalError,
  onClose,
  onSelect,
  onRename,
  onAdd,
  onClearData,
}: ChildProfileSheetProps) {
  const [action, setAction] = useState<ChildAction>('none');
  const [draftName, setDraftName] = useState('');
  const [draftGrade, setDraftGrade] = useState<number | ''>('');
  const [draftAvatar, setDraftAvatar] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocusTrap<HTMLElement>(open, onClose, closeButtonRef);
  const selectedChild = children.find((child) => child.child_profile_id === selectedChildId);
  const busy = saving || working;

  useEffect(() => {
    if (!draftAvatar) {
      setAvatarPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(draftAvatar);
    setAvatarPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draftAvatar]);

  if (!open) return null;

  const closeSheet = () => {
    setAction('none');
    setDraftName('');
    setDraftGrade('');
    setDraftAvatar(null);
    setRemoveAvatar(false);
    setLocalError(null);
    onClose();
  };

  const submitName = async (event: FormEvent) => {
    event.preventDefault();
    const name = draftName.trim();
    const gradeLevel = normalizeGradeLevel(draftGrade);
    if (name.length < 2 || !gradeLevel) return;
    setLocalError(null);
    setWorking(true);
    try {
      if (action === 'rename') {
        await onRename(name, gradeLevel, draftAvatar, removeAvatar);
        closeSheet();
        return;
      }
      if (action === 'add') {
        const child = await onAdd(name, gradeLevel, draftAvatar);
        closeSheet();
        onSelect(child);
      }
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Không lưu được hồ sơ trẻ.');
    } finally {
      setWorking(false);
    }
  };

  const selectAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      validateChildAvatarFile(file);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Ảnh đại diện không hợp lệ.');
      return;
    }
    setLocalError(null);
    setRemoveAvatar(false);
    setDraftAvatar(file);
  };

  const clearAvatar = () => {
    setDraftAvatar(null);
    setRemoveAvatar(action === 'rename' && Boolean(selectedChild?.child_avatar_url));
    setLocalError(null);
  };

  const clearData = async () => {
    if (!onClearData) return;
    setLocalError(null);
    setWorking(true);
    try {
      await onClearData();
      closeSheet();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Không xóa được dữ liệu của bé.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="app-drawer-layer child-sheet-layer">
      <button type="button" className="app-drawer-backdrop" onClick={closeSheet} aria-label="Đóng danh sách hồ sơ trẻ" />
      <section ref={dialogRef} className="child-profile-sheet" role="dialog" aria-modal="true" aria-label="Quản lý hồ sơ trẻ" tabIndex={-1}>
        <header className="child-sheet-header">
          <div><b>Hồ sơ trẻ</b><small>Chọn bé bạn muốn theo dõi</small></div>
          <button ref={closeButtonRef} type="button" className="header-icon-button" onClick={closeSheet} aria-label="Đóng">
            <MaterialIcon name="close" className="text-xl" />
          </button>
        </header>

        <div className="child-profile-list">
          {children.map((child) => {
            const selected = child.child_profile_id === selectedChildId;
            return (
              <button
                key={child.child_profile_id}
                type="button"
                className={`child-profile-option ${selected ? 'is-selected' : ''}`}
                aria-current={selected ? 'true' : undefined}
                onClick={() => { if (!selected) { closeSheet(); onSelect(child); } }}
              >
                <ChildAvatar className="child-profile-avatar" name={child.child_name} avatarPath={child.child_avatar_url} />
                <span className="child-profile-copy">
                  <b>{child.child_name || 'Bé'}</b>
                  <small>{formatGradeLabel(child.child_grade_level)} · {selected ? 'Đang xem lịch và tiến độ' : 'Chuyển sang hồ sơ này'}</small>
                </span>
                <MaterialIcon name={selected ? 'check_circle' : 'chevron_right'} className="text-xl" filled={selected} />
              </button>
            );
          })}
        </div>

        {action === 'rename' || action === 'add' ? (
          <form className="child-name-form" onSubmit={submitName}>
            <div className="child-avatar-editor">
              <ChildAvatar
                className="child-avatar-editor-preview"
                name={draftName || selectedChild?.child_name}
                avatarPath={action === 'rename' && !removeAvatar ? selectedChild?.child_avatar_url : null}
                previewUrl={avatarPreviewUrl}
              />
              <div className="child-avatar-editor-actions">
                <label className="child-avatar-picker">
                  <MaterialIcon name="photo_camera" />
                  <span>{draftAvatar || (action === 'rename' && selectedChild?.child_avatar_url) ? 'Đổi ảnh' : 'Chọn ảnh'}</span>
                  <input type="file" accept={CHILD_AVATAR_ACCEPT} onChange={selectAvatar} disabled={busy} />
                </label>
                {(draftAvatar || (action === 'rename' && !removeAvatar && selectedChild?.child_avatar_url)) ? (
                  <button type="button" className="child-avatar-remove" onClick={clearAvatar} disabled={busy}>
                    <MaterialIcon name="delete" />Xóa ảnh
                  </button>
                ) : null}
                <small>JPEG, PNG hoặc WebP · tối đa {Math.round(APP_CONFIG.childAvatarMaxBytes / 1024 / 1024)} MB</small>
              </div>
            </div>
            <label>
              {action === 'rename' ? 'Tên của bé' : 'Tên bé / học sinh'}
              <input
                autoFocus
                className="gemini-control"
                value={draftName}
                minLength={2}
                maxLength={100}
                placeholder={action === 'rename' ? selectedChild?.child_name || 'Tên của bé' : 'VD: Bé Bảo An'}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
            <div className="app-field-group">
              <span className="app-field-label">Lớp đang học</span>
              <AppDropdown
                ariaLabel="Lớp đang học"
                placeholder="Chọn lớp hiện tại"
                value={draftGrade ? String(draftGrade) : ''}
                onChange={(value) => setDraftGrade(value ? Number(value) : '')}
                options={GRADE_LEVEL_OPTIONS.map((grade) => ({
                  value: String(grade),
                  label: `Lớp ${grade}`,
                  icon: 'school',
                }))}
              />
            </div>
            <div className="child-form-actions">
              <button type="button" className="secondary-action" onClick={() => { setAction('none'); setDraftAvatar(null); setRemoveAvatar(false); setLocalError(null); }}>Hủy</button>
              <button type="submit" className="primary-action" disabled={busy || draftName.trim().length < 2 || !normalizeGradeLevel(draftGrade)}>
                {busy ? 'Đang lưu…' : action === 'rename' ? 'Lưu thông tin' : 'Thêm bé'}
              </button>
            </div>
          </form>
        ) : (
          <div className="child-profile-actions">
            <button type="button" onClick={() => { setAction('rename'); setDraftName(selectedChild?.child_name || ''); setDraftGrade(selectedChild?.child_grade_level ?? ''); setDraftAvatar(null); setRemoveAvatar(false); }}>
              <MaterialIcon name="edit" /><span>Sửa thông tin</span>
            </button>
            <button type="button" onClick={() => { setAction('add'); setDraftName(''); setDraftGrade(''); setDraftAvatar(null); setRemoveAvatar(false); }}>
              <MaterialIcon name="person_add" /><span>Thêm bé</span>
            </button>
          </div>
        )}

        <p className="child-privacy-note"><MaterialIcon name="shield" />Lịch, mục tiêu và tiến độ của mỗi bé được lưu riêng.</p>
        {(localError || externalError) ? <p className="child-sheet-error">{localError ?? externalError}</p> : null}

        {onClearData ? (
          action === 'clear' ? (
            <div className="child-clear-confirm">
              <p>Xóa toàn bộ lịch, mục tiêu và tiến độ của {selectedChild?.child_name || 'bé'}?</p>
              <div className="child-form-actions">
                <button type="button" className="secondary-action" onClick={() => setAction('none')}>Hủy</button>
                <button type="button" className="danger-action" disabled={busy} onClick={() => void clearData()}>{busy ? 'Đang xóa…' : 'Xác nhận xóa'}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="child-clear-button" onClick={() => setAction('clear')}>Xóa dữ liệu của bé này</button>
          )
        ) : null}
      </section>
    </div>
  );
}
