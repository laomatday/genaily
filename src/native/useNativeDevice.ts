import { useCallback, useEffect, useState } from 'react';
import { nativeStudyLock, type NativeDeviceStatus } from './studyLock';

export function useNativeDevice() {
  const [status, setStatus] = useState<NativeDeviceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const value = await nativeStudyLock.status();
      setStatus(value);
      setError(null);
      return value;
    } catch {
      setError('Không đọc được trạng thái Android. Hãy mở lại ứng dụng.');
      return null;
    }
  }, []);
  useEffect(() => {
    let active = true;
    const read = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const value = await nativeStudyLock.status();
        if (active) { setStatus(value); setError(null); }
      } catch {
        if (active) setError('Không đọc được trạng thái Android. Hãy mở lại ứng dụng.');
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 5000);
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, []);
  return { status, error, refresh };
}
