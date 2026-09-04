import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppTheme = 'light' | 'dark';
export type ThemePreference = AppTheme | 'system';

const THEME_STORAGE_KEY = 'genai_app_theme';

interface ThemeContextValue {
  theme: AppTheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): AppTheme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getInitialPreference(): ThemePreference {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
      // Fall back to the device preference when storage is unavailable.
    }
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getInitialPreference);
  const [systemTheme, setSystemTheme] = useState<AppTheme>(getSystemTheme);
  const theme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => setSystemTheme(media.matches ? 'dark' : 'light');
    updateSystemTheme();
    media.addEventListener('change', updateSystemTheme);
    return () => media.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme;
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--app-primary')
      .trim();
    if (themeColor) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // The active theme still applies for the current session.
    }
  }, [preference, theme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreferenceState(theme === 'light' ? 'dark' : 'light');
  }, [theme]);
  const value = useMemo(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [preference, setPreference, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme phải được dùng bên trong ThemeProvider.');
  return context;
}
