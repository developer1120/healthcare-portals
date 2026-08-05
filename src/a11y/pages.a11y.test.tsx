import { screen, waitFor } from '@testing-library/react';
import { axeViolations } from '@/test/axe';
import { renderRoute } from '@/test/renderRoute';

/** Waits until nothing on the page is still loading. */
async function settled() {
  await waitFor(() => expect(screen.queryAllByRole('status', { name: /^Loading/ })).toHaveLength(0), { timeout: 3000 });
}

const patientPages = [
  '/',
  '/appointments',
  '/appointments/book',
  '/messages',
  '/messages/thr-dizzy',
  '/messages/new',
  '/results',
  '/results/lab-006',
  '/medications',
  '/vitals',
  '/records',
  '/billing',
  '/billing/insurance',
  '/notifications',
  '/profile',
  '/settings',
];

const clinicianPages = [
  '/clinic',
  '/clinic/patients',
  '/clinic/patients/pat-grace',
  '/clinic/inbox',
  '/clinic/inbox/thr-ruth-fall',
  '/clinic/requests',
  '/clinic/requests?tab=labs',
  '/clinic/settings',
];

describe('axe: patient pages', () => {
  it.each(patientPages)('%s has no violations', async (path) => {
    renderRoute(path);
    await settled();
    expect(await axeViolations()).toEqual([]);
  });
});

describe('axe: clinician pages', () => {
  it.each(clinicianPages)('%s has no violations', async (path) => {
    renderRoute(path, { as: 'clinician' });
    await settled();
    expect(await axeViolations()).toEqual([]);
  });
});

describe('axe: signed out', () => {
  it('sign-in has no violations', async () => {
    renderRoute('/sign-in', { as: null });
    await screen.findByRole('button', { name: /Sign in/ });
    expect(await axeViolations()).toEqual([]);
  });
});
