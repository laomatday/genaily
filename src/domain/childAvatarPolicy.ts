import { APP_CONFIG } from '../config/appConfig';

interface ChildAvatarFileMetadata {
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

const CHILD_AVATAR_METADATA_BY_MIME = new Map<string, ChildAvatarFileMetadata>([
  ['image/jpeg', { contentType: 'image/jpeg', extension: 'jpg' }],
  ['image/jpg', { contentType: 'image/jpeg', extension: 'jpg' }],
  ['image/png', { contentType: 'image/png', extension: 'png' }],
  ['image/webp', { contentType: 'image/webp', extension: 'webp' }],
]);

const CHILD_AVATAR_METADATA_BY_EXTENSION = new Map<string, ChildAvatarFileMetadata>([
  ['jpg', { contentType: 'image/jpeg', extension: 'jpg' }],
  ['jpeg', { contentType: 'image/jpeg', extension: 'jpg' }],
  ['png', { contentType: 'image/png', extension: 'png' }],
  ['webp', { contentType: 'image/webp', extension: 'webp' }],
]);

export const CHILD_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export function validateChildAvatarFile(file: File): ChildAvatarFileMetadata {
  const mime = file.type.trim().toLowerCase();
  const extension = file.name.split('.').pop()?.trim().toLowerCase() ?? '';
  const metadata = CHILD_AVATAR_METADATA_BY_MIME.get(mime)
    ?? (!mime ? CHILD_AVATAR_METADATA_BY_EXTENSION.get(extension) : undefined);

  if (!metadata) throw new Error('Ảnh đại diện phải là JPEG, PNG hoặc WebP.');
  if (file.size <= 0 || file.size > APP_CONFIG.childAvatarMaxBytes) {
    throw new Error(`Ảnh đại diện không được vượt quá ${Math.round(APP_CONFIG.childAvatarMaxBytes / 1024 / 1024)} MB.`);
  }
  return metadata;
}
