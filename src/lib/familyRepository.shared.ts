import { isFamilyContext, type FamilyContext } from './familyIdentity';
import type { FamilyData } from './familyRepository.types';

interface SupabaseErrorLike { message: string }
const CHILD_CACHE_PREFIX = 'genai_child_store_v1_';

export function assertValidContext(ctx: FamilyContext): void {
  if (!isFamilyContext(ctx)) throw new Error('Hồ sơ của bé không hợp lệ. Vui lòng chọn lại bé.');
}
export function throwIfSupabaseError(error: SupabaseErrorLike | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}
export function getLocalCacheKey(ctx: FamilyContext): string {
  return `${CHILD_CACHE_PREFIX}${ctx.familyId}_${ctx.childProfileId}`;
}

// Sensitive child data is never persisted. These compatibility exports only
// purge cache keys created by older app builds.
export function getLocalChildData(ctx: FamilyContext): FamilyData | null {
  if (typeof window === 'undefined' || !isFamilyContext(ctx)) return null;
  try { localStorage.removeItem(getLocalCacheKey(ctx)); } catch { /* Storage is optional. */ }
  return null;
}
export function saveLocalChildData(ctx: FamilyContext, _data: FamilyData): void {
  void _data;
  if (typeof window === 'undefined' || !isFamilyContext(ctx)) return;
  try {
    localStorage.removeItem(getLocalCacheKey(ctx));
    localStorage.removeItem(`genai_family_store_v2_${ctx.familyId}`);
    localStorage.removeItem(`genai_family_store_${ctx.familyId}`);
  } catch { /* Storage is optional. */ }
}
