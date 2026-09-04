import { useTheme } from '../hooks/useTheme';
import { MaterialIcon } from './MaterialIcon';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      <MaterialIcon name={isDark ? 'light_mode' : 'dark_mode'} className="text-xl" />
    </button>
  );
}
