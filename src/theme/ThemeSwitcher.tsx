import { SegmentedControl } from '@/ui';
import type { ThemePreference } from './themeStore';
import { useThemeStore } from './themeStore';

const options: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeSwitcher() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  return <SegmentedControl label="Colour theme" options={options} value={preference} onChange={setPreference} />;
}
