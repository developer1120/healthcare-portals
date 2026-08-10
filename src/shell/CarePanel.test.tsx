import { screen, waitFor, within } from '@testing-library/react';
import { configureApi } from '@/api/config';
import { getDb } from '@/api/mockDb';
import { queryKeys } from '@/api/queryKeys';
import { PRIMARY_PATIENT_ID } from '@/data/seed';
import type { PatientTask } from '@/domain/types';
import { renderRoute } from '@/test/renderRoute';

function panel() {
  return screen.getByRole('complementary', { name: 'Care panel' });
}

async function section(name: string) {
  const heading = await within(panel()).findByRole('heading', { name });
  return heading.parentElement!;
}

describe('CarePanel', () => {
  it('shows a loading state, then the care team with the primary clinician first', async () => {
    renderRoute('/');
    expect(within(panel()).getByRole('status', { name: 'Loading your care team' })).toBeInTheDocument();

    const team = await section('Care team');
    const items = await within(team).findAllByRole('listitem');
    const rows = items.map((item) => [...item.querySelectorAll('p')].map((p) => p.textContent));
    expect(rows).toEqual([
      ['Jonas Lindqvist', 'Primary care'],
      ['Dr. Maya Okafor', 'Cardiology'],
      ['Dr. Tomás Ferreira', 'Endocrinology'],
      ['Rosa Delgado', 'Nurse'],
    ]);
  });

  it('lists the most pressing tasks as links, with a count of what is open', async () => {
    renderRoute('/');
    const tasks = await section('To do');

    const links = await within(tasks).findAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Log today’s blood pressure',
      'Pre-check in for your video visit',
      'Request a lisinopril refill',
      'Pay your October statement',
    ]);
    expect(links[0]).toHaveAttribute('href', '/vitals');
    expect(within(tasks).getByText('5 open · 2 more on Home')).toBeInTheDocument();
  });

  it('ticks a task off straight away and saves it', async () => {
    const { user } = renderRoute('/');
    const tasks = await section('To do');

    await user.click(await within(tasks).findByRole('checkbox', { name: 'Mark "Log today’s blood pressure" as done' }));

    // The optimistic update moves it below the open tasks immediately.
    expect(within(tasks).queryByRole('checkbox', { name: /Log today’s blood pressure/ })).not.toBeInTheDocument();
    expect(within(tasks).getByText('4 open · 2 more on Home')).toBeInTheDocument();
    await waitFor(() => expect(getDb().tasks.find((t) => t.id === 'tsk-1')!.completedAt).toBeDefined());
  });

  it('rolls the tick back if saving fails', async () => {
    const { user, queryClient } = renderRoute('/');
    const tasks = await section('To do');
    const checkbox = await within(tasks).findByRole('checkbox', { name: /Log today’s blood pressure/ });

    configureApi({ failureRate: 1 });
    await user.click(checkbox);

    await waitFor(() => {
      const cached = queryClient.getQueryData<PatientTask[]>(queryKeys.tasks(PRIMARY_PATIENT_ID));
      expect(cached?.find((t) => t.id === 'tsk-1')?.completedAt).toBeUndefined();
    });
    expect(getDb().tasks.find((t) => t.id === 'tsk-1')!.completedAt).toBeUndefined();
  });

  it('previews the latest message and marks it unread', async () => {
    renderRoute('/');
    const messages = await section('Messages');
    const link = await within(messages).findByRole('link', { name: /Your lab results are ready/ });

    expect(link).toHaveAttribute('href', '/messages/thr-results');
    expect(within(link).getByRole('img', { name: 'Unread' })).toBeInTheDocument();
    expect(link).toHaveTextContent('Rosa Delgado · 2 h ago');
  });

  it('shows an error with a retry when loading fails, and recovers', async () => {
    configureApi({ failureRate: 1 });
    const { user } = renderRoute('/');
    const team = await section('Care team');

    const alert = await within(team).findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load your care team. The connection dropped.");

    configureApi({ failureRate: 0 });
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(team).findByText('Jonas Lindqvist')).toBeInTheDocument();
  });
});

describe('background refresh failures', () => {
  it('keep showing data that already loaded instead of replacing it with an error', async () => {
    const { queryClient } = renderRoute('/');
    const team = await section('Care team');
    await within(team).findByText('Jonas Lindqvist');

    configureApi({ failureRate: 1 });
    await queryClient.invalidateQueries({ queryKey: queryKeys.careTeam(PRIMARY_PATIENT_ID) });
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.careTeam(PRIMARY_PATIENT_ID))?.status).toBe('error'));

    expect(within(team).getByText('Jonas Lindqvist')).toBeInTheDocument();
    expect(within(team).queryByRole('alert')).not.toBeInTheDocument();
  });
});
