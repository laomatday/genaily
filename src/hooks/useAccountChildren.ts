import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { normalizeGradeLevel } from '../domain/education';
import { isFamilyContext, isUuid, purgeInvalidFamilyStorage, type FamilyContext } from '../lib/familyIdentity';
import { uploadChildAvatar } from '../lib/familyRepository.mutations';
import { supabase } from '../lib/supabase';

export interface AccountChild {
  account_space_id: string;
  parent_profile_id: string;
  child_profile_id: string;
  child_name: string;
  child_avatar_url: string | null;
  child_grade_level: number | null;
  child_joined_at: string;
}

export function contextFromAccountChild(child: AccountChild): FamilyContext | null {
  const context: FamilyContext = {
    familyId: child.account_space_id,
    parentProfileId: child.parent_profile_id,
    childProfileId: child.child_profile_id,
  };
  return isFamilyContext(context) ? context : null;
}

const ACCOUNT_CHILDREN_CACHE_PREFIX = 'genai_account_children_v1_';

export function sanitizeAccountChildren(value: unknown): AccountChild[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AccountChild[] => {
    if (!item || typeof item !== 'object') return [];
    const child = item as Partial<AccountChild>;
    const valid = isUuid(child.account_space_id)
      && isUuid(child.parent_profile_id)
      && isUuid(child.child_profile_id)
      && typeof child.child_name === 'string'
      && (child.child_avatar_url === null || typeof child.child_avatar_url === 'string')
      && (child.child_grade_level == null || normalizeGradeLevel(child.child_grade_level) !== null)
      && typeof child.child_joined_at === 'string';
    if (!valid) return [];
    return [{
      ...child,
      child_grade_level: normalizeGradeLevel(child.child_grade_level),
    } as AccountChild];
  });
}

function getCacheKey(userId: string): string {
  return `${ACCOUNT_CHILDREN_CACHE_PREFIX}${userId}`;
}

function getStoredAccountChildren(userId: string): AccountChild[] {
  if (typeof window === 'undefined') return [];
  purgeInvalidFamilyStorage(userId);
  try {
    localStorage.removeItem(getCacheKey(userId));
    localStorage.removeItem(`genai_user_families_${userId}`);
  } catch {
    // Browser storage is optional.
  }
  return [];
}

export function saveStoredAccountChildren(userId: string, children: AccountChild[]): void {
  if (typeof window === 'undefined') return;
  try {
    void children;
    localStorage.removeItem(getCacheKey(userId));
    localStorage.removeItem(`genai_user_families_${userId}`);
  } catch {
    // Local cache is optional.
  }
}

export function useAccountChildren(user: User | null) {
  const userId = user?.id;
  const [children, setChildren] = useState<AccountChild[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      requestGeneration.current += 1;
      setChildren([]);
      setLoading(false);
      setError(null);
      return [];
    }

    const targetUserId = userId;
    const generation = ++requestGeneration.current;
    getStoredAccountChildren(targetUserId);
    setChildren([]);
    setLoading(true);

    try {
      const { data, error: queryError } = await supabase.rpc('get_account_children');
      if (queryError) throw new Error(`Không tải được danh sách con: ${queryError.message}`);
      if (generation !== requestGeneration.current) return [];
      const nextChildren = sanitizeAccountChildren(data ?? []);
      saveStoredAccountChildren(targetUserId, nextChildren);
      setChildren(nextChildren);
      setError(null);
      return nextChildren;
    } catch (cause) {
      if (generation !== requestGeneration.current) return [];
      const message = cause instanceof Error ? cause.message : 'Không tải được danh sách con.';
      setChildren([]);
      setError(message);
      return [];
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    return () => {
      requestGeneration.current += 1;
    };
  }, [refresh]);

  const addChild = useCallback(async (
    childName: string,
    gradeLevel: number,
    avatarFile?: File | null,
  ): Promise<AccountChild> => {
    if (!userId) throw new Error('Bạn cần đăng nhập để thêm hồ sơ trẻ.');
    const name = childName.trim();
    if (name.length < 2 || name.length > 100) throw new Error('Tên bé phải có từ 2 đến 100 ký tự.');
    const grade = normalizeGradeLevel(gradeLevel);
    if (!grade) throw new Error('Lớp đang học phải từ lớp 1 đến lớp 12.');

    const { data, error: rpcError } = await supabase.rpc('add_child_profile_with_grade', {
      p_child_name: name,
      p_grade_level: grade,
    });
    if (rpcError) throw new Error(`Không thêm được hồ sơ con: ${rpcError.message}`);

    const created = data?.[0];
    let child: AccountChild = {
      account_space_id: created?.account_space_id ?? '',
      parent_profile_id: created?.parent_profile_id ?? '',
      child_profile_id: created?.child_profile_id ?? '',
      child_name: created?.child_name ?? name,
      child_avatar_url: null,
      child_grade_level: normalizeGradeLevel(created?.child_grade_level) ?? grade,
      child_joined_at: new Date().toISOString(),
    };
    const childContext = contextFromAccountChild(child);
    if (!childContext) throw new Error('Máy chủ trả về hồ sơ con không hợp lệ.');

    if (avatarFile) {
      try {
        const avatarPath = await uploadChildAvatar(childContext, avatarFile);
        child = { ...child, child_avatar_url: avatarPath };
      } catch (cause) {
        await refresh();
        const detail = cause instanceof Error ? cause.message : 'Lỗi không xác định.';
        throw new Error(
          `Hồ sơ đã được tạo nhưng chưa lưu được ảnh: ${detail} Hãy mở Sửa thông tin để thử lại.`,
          { cause },
        );
      }
    }

    saveStoredAccountChildren(userId, [...children, child]);
    const refreshed = await refresh();
    return refreshed.find((item) => item.child_profile_id === child.child_profile_id) ?? child;
  }, [children, refresh, userId]);

  return { children, loading, error, refresh, addChild };
}
