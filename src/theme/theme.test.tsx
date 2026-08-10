import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setSystemDarkMode } from '@/test/matchMedia';
import { THEME_STORAGE_KEY, resolveTheme, useThemeStore } from './themeStore';
import { ThemeSwitcher } from './ThemeSwitcher';
import { useApplyTheme } from './useApplyTheme';

describe('resolveTheme', () => {
  it('uses an explicit choice as is', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('useApplyTheme', () => {
  it('writes the resolved theme to the root element', () => {
    useThemeStore.setState({ preference: 'dark' });
    const { result } = renderHook(() => useApplyTheme());

    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('tracks the operating system while the preference is system', () => {
    const { result } = renderHook(() => useApplyTheme());
    expect(result.current).toBe('light');

    act(() => setSystemDarkMode(true));
    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('ignores the operating system once the user picks a theme', () => {
    useThemeStore.setState({ preference: 'light' });
    const { result } = renderHook(() => useApplyTheme());

    act(() => setSystemDarkMode(true));
    expect(result.current).toBe('light');
  });
});

describe('ThemeSwitcher', () => {
  it('shows the current preference as the checked option', () => {
    render(<ThemeSwitcher />);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  });

  it('saves the chosen theme so it survives a reload', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(useThemeStore.getState().preference).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? '{}')).toMatchObject({
      state: { preference: 'dark' },
    });
  });

  it('can be driven from the keyboard', async () => {
    const user = userEvent.setup();
    useThemeStore.setState({ preference: 'light' });
    render(<ThemeSwitcher />);

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(useThemeStore.getState().preference).toBe('dark');
  });
});
