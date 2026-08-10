import { act, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/matchMedia';
import { renderRoute } from '@/test/renderRoute';

const primaryNav = () => screen.getByRole('navigation', { name: 'Primary' });

describe('on a phone', () => {
  beforeEach(() => setViewportWidth(375));

  it('swaps the rail for a bottom bar with the first sections and More', async () => {
    renderRoute('/');
    const nav = primaryNav();
    expect(await within(nav).findByRole('link', { name: 'Messages, 1 unread' })).toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    // "Appointments" is too long for a fifth of a phone, so the bar says "Visits".
    for (const name of ['Home', 'Visits', 'Results']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mendwell home' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the other sections from More and closes after choosing one', async () => {
    const { user, router } = renderRoute('/');
    await user.click(within(primaryNav()).getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    expect(within(sheet).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Medications',
      'Vitals',
      'Health record',
      'Billing',
      'Settings',
    ]);
    await user.click(within(sheet).getByRole('link', { name: 'Billing' }));
    expect(router.state.location.pathname).toBe('/billing');
    expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
  });

  it('closes More with Escape and returns focus to the button', async () => {
    const { user } = renderRoute('/');
    const more = within(primaryNav()).getByRole('button', { name: 'More' });
    await user.click(more);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('fits every clinician section without More', async () => {
    renderRoute('/clinic', { as: 'clinician' });
    const nav = primaryNav();
    expect(within(nav).queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(await within(nav).findByRole('link', { name: /^Inbox, \d+ unread$/ })).toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(5);
  });
});

describe('the care panel below wide screens', () => {
  beforeEach(() => setViewportWidth(1024));

  it('opens as a drawer instead of a column', async () => {
    const { user } = renderRoute('/');
    expect(screen.queryByRole('complementary', { name: 'Care panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hide care panel' })).not.toBeInTheDocument();
    expect(primaryNav()).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Open care panel' });
    await user.click(toggle);
    const drawer = screen.getByRole('dialog', { name: 'Your care' });
    expect(await within(drawer).findByText('Jonas Lindqvist')).toBeInTheDocument();
    expect(within(drawer).getByRole('heading', { name: 'To do' })).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it('closes when a link inside it is followed', async () => {
    const { user, router } = renderRoute('/');
    await user.click(screen.getByRole('button', { name: 'Open care panel' }));
    const drawer = screen.getByRole('dialog', { name: 'Your care' });
    const link = await within(drawer).findByRole('link', { name: /Your lab results are ready/ });
    await user.click(link);
    expect(router.state.location.pathname).toMatch(/^\/messages\//);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Your care' })).not.toBeInTheDocument());
  });

  it('switches back to the column when the window widens', async () => {
    const { user } = renderRoute('/');
    await user.click(screen.getByRole('button', { name: 'Open care panel' }));
    act(() => setViewportWidth(1440));
    expect(screen.queryByRole('dialog', { name: 'Your care' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Care panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide care panel' })).toBeInTheDocument();
  });

  it('is not offered to clinicians', () => {
    renderRoute('/clinic', { as: 'clinician' });
    expect(screen.queryByRole('button', { name: 'Open care panel' })).not.toBeInTheDocument();
  });
});
