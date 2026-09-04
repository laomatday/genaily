import { useEffect, useState } from 'react';
import { APP_CONFIG } from '../config/appConfig';
import { getChildAvatarSignedUrl } from '../lib/familyRepository.mutations';

interface CachedAvatar {
  expiresAt: number;
  url: string;
}

const avatarUrlCache = new Map<string, CachedAvatar>();

interface ChildAvatarProps {
  avatarPath?: string | null;
  className?: string;
  name?: string | null;
  previewUrl?: string | null;
}

function initialFor(name: string | null | undefined): string {
  return (name || 'Bé').trim().charAt(0).toUpperCase() || 'B';
}

function cachedUrl(path: string): string | null {
  const cached = avatarUrlCache.get(path);
  if (!cached || cached.expiresAt <= Date.now()) {
    avatarUrlCache.delete(path);
    return null;
  }
  return cached.url;
}

export function ChildAvatar({ avatarPath, className = '', name, previewUrl }: ChildAvatarProps) {
  const immediateUrl = previewUrl
    ?? (avatarPath && /^https:\/\//i.test(avatarPath) ? avatarPath : null)
    ?? (avatarPath ? cachedUrl(avatarPath) : null);
  const [imageUrl, setImageUrl] = useState<string | null>(immediateUrl);

  useEffect(() => {
    if (previewUrl) {
      setImageUrl(previewUrl);
      return;
    }
    if (!avatarPath) {
      setImageUrl(null);
      return;
    }
    if (/^https:\/\//i.test(avatarPath)) {
      setImageUrl(avatarPath);
      return;
    }
    const existing = cachedUrl(avatarPath);
    if (existing) {
      setImageUrl(existing);
      return;
    }

    let active = true;
    setImageUrl(null);
    void getChildAvatarSignedUrl(avatarPath)
      .then((url) => {
        if (!active) return;
        avatarUrlCache.set(avatarPath, {
          url,
          expiresAt: Date.now() + APP_CONFIG.childAvatarSignedUrlSeconds * 1000 * 0.9,
        });
        setImageUrl(url);
      })
      .catch(() => {
        if (active) setImageUrl(null);
      });
    return () => {
      active = false;
    };
  }, [avatarPath, previewUrl]);

  return (
    <span className={`child-avatar ${className}`}>
      {imageUrl
        ? <img src={imageUrl} alt={`Ảnh đại diện của ${name || 'bé'}`} />
        : <span aria-hidden="true">{initialFor(name)}</span>}
    </span>
  );
}
