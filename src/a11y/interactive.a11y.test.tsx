import { screen, within } from '@testing-library/react';
import { axeViolations } from '@/test/axe';
import { setViewportWidth } from '@/test/matchMedia';
import { renderRoute } from '@/test/renderRoute';

describe('axe: dialogs and popovers', () => {
  it('pay and payment-plan dialogs', async () => {
    const { user } = renderRoute('/billing');
    const balance = await screen.findByRole('region', { name: 'Account balance' });
    await user.click(within(balance).getByRole('button', { name: 'Pay now' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('radio', { name: /Another amount/ }));
    expect(await axeViolations()).toEqual([]);

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await user.click(within(balance).getByRole('button', { name: 'Set up a payment plan' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start plan' }));
    expect(await axeViolations()).toEqual([]);
  });

  it('notification panel and account menu', async () => {
    const { user } = renderRoute('/');
    await user.click(await screen.findByRole('button', { name: /^Notifications/ }));
    await screen.findByRole('region', { name: 'Latest notifications' });
    expect(await axeViolations()).toEqual([]);

    await user.click(screen.getByRole('button', { name: /account/ }));
    expect(await axeViolations()).toEqual([]);
  });

  it('caregiver invitation with errors showing', async () => {
    const { user } = renderRoute('/profile');
    await user.click(await screen.findByRole('button', { name: 'Invite a caregiver' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send invitation' }));
    expect(await axeViolations()).toEqual([]);
  });

  it('refill decision and result sign-off', async () => {
    const { user } = renderRoute('/clinic/requests', { as: 'clinician' });
    const refills = await screen.findByRole('list', { name: 'Refill requests, oldest first' });
    await user.click(within(refills).getAllByRole('button', { name: 'Review' })[0]!);
    await user.click(within(screen.getByRole('dialog')).getByRole('radio', { name: 'Decline' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Decline refill' }));
    expect(await axeViolations()).toEqual([]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('radio', { name: /^Results to sign/ }));
    await user.click((await screen.findAllByRole('button', { name: 'Sign off' }))[0]!);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign off and release' }));
    expect(await axeViolations()).toEqual([]);
  });

  it('phone More sheet and care drawer', async () => {
    setViewportWidth(375);
    const { user } = renderRoute('/');
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(await axeViolations()).toEqual([]);
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Open care panel' }));
    await within(screen.getByRole('dialog', { name: 'Your care' })).findByText('Jonas Lindqvist');
    expect(await axeViolations()).toEqual([]);
  });
});

describe('page change announcements', () => {
  const announcer = () => screen.getByTestId('route-announcer');

  it('stays quiet on the first page and announces each page navigated to', async () => {
    const { user } = renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: /^Good/ });
    expect(announcer()).toBeEmptyDOMElement();
    expect(announcer()).toHaveAttribute('aria-live', 'polite');

    await user.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Billing' }));
    expect(announcer()).toHaveTextContent('Billing');
  });

  it('uses the page’s own heading once it is known', async () => {
    const { user } = renderRoute('/clinic/patients', { as: 'clinician' });
    await user.click(await screen.findByRole('link', { name: 'Grace Whitfield' }));
    await screen.findByRole('heading', { level: 1, name: 'Grace Whitfield' });
    expect(announcer()).toHaveTextContent('Grace Whitfield');
  });
});

describe('keyboard access to scrolling areas', () => {
  it('lets keyboard users focus and scroll a conversation', async () => {
    renderRoute('/messages/thr-dizzy');
    expect(await screen.findByRole('list', { name: 'Messages' })).toHaveAttribute('tabindex', '0');
  });

  it('does the same in the clinician inbox', async () => {
    renderRoute('/clinic/inbox/thr-ruth-fall', { as: 'clinician' });
    expect(await screen.findByRole('list', { name: 'Messages' })).toHaveAttribute('tabindex', '0');
  });
});
