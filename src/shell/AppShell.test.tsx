import { screen, within } from '@testing-library/react';
import { patientNav } from '@/app/navigation';
import { documentTitleFor } from '@/app/routeHandle';
import { renderRoute } from '@/test/renderRoute';
import { LAYOUT_STORAGE_KEY, useLayoutStore } from './layoutStore';

describe('AppShell', () => {
  it('shows the page title and today’s date in the top bar', () => {
    renderRoute('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Tuesday 13 October')).toBeInTheDocument();
  });

  it('lists every patient section in the primary navigation', () => {
    renderRoute('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const item of patientNav) {
      // Names can carry a count once data loads, e.g. "Messages, 1 unread".
      expect(within(nav).getByRole('link', { name: new RegExp(`^${item.label}`) })).toHaveAttribute('href', item.to);
    }
    expect(within(nav).getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('navigates between sections and marks the current one', async () => {
    const { user, router } = renderRoute('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

    await user.click(within(nav).getByRole('link', { name: 'Health record' }));

    expect(router.state.location.pathname).toBe('/records');
    expect(screen.getByRole('heading', { level: 1, name: 'Health record' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Health record' })).toHaveAttribute('aria-current', 'page');
    // "/" matches exactly, so Home is no longer marked.
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the document title in step with the page', async () => {
    const { user } = renderRoute('/');
    expect(document.title).toBe('Mendwell');

    await user.click(screen.getByRole('link', { name: 'Medications' }));
    expect(document.title).toBe('Medications · Mendwell');
  });

  it('offers a skip link to the main content', () => {
    renderRoute('/');
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('links the logo back to home', async () => {
    const { user, router } = renderRoute('/billing');
    await user.click(screen.getByRole('link', { name: 'Mendwell home' }));
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows a not-found page for unknown paths', () => {
    renderRoute('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/');
  });

  it('puts the theme switcher on the settings page', () => {
    renderRoute('/settings');
    expect(screen.getByRole('region', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Colour theme' })).toBeInTheDocument();
  });
});

describe('care panel', () => {
  it('is open by default', () => {
    renderRoute('/');
    const panel = screen.getByRole('complementary', { name: 'Care panel' });
    expect(within(panel).getByRole('heading', { name: 'Care team' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'To do' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Messages' })).toBeInTheDocument();
  });

  it('can be hidden and shown from the top bar, and remembers the choice', async () => {
    const { user } = renderRoute('/');
    const toggle = screen.getByRole('button', { name: 'Hide care panel' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(screen.queryByRole('complementary', { name: 'Care panel' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}')).toMatchObject({
      state: { carePanelOpen: false },
    });

    await user.click(screen.getByRole('button', { name: 'Show care panel' }));
    expect(screen.getByRole('complementary', { name: 'Care panel' })).toBeInTheDocument();
  });

  it('closes from its own close button', async () => {
    const { user } = renderRoute('/');
    await user.click(screen.getByRole('button', { name: 'Close care panel' }));
    expect(useLayoutStore.getState().carePanelOpen).toBe(false);
    expect(screen.getByRole('button', { name: 'Show care panel' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('documentTitleFor', () => {
  it('uses the bare product name for home', () => {
    expect(documentTitleFor('Home')).toBe('Mendwell');
    expect(documentTitleFor('Vitals')).toBe('Vitals · Mendwell');
  });
});
