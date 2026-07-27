import { screen, within } from '@testing-library/react';
import { configureApi } from '@/api/config';
import { writeDb } from '@/api/mockDb';
import { greetingFor } from '@/lib/greeting';
import { setViewportWidth } from '@/test/matchMedia';
import { renderRoute } from '@/test/renderRoute';

/** A dashboard card by name, looked up inside the page (the care panel has its own "To do"). */
function region(name: string) {
  return within(screen.getByRole('main')).findByRole('region', { name });
}

describe('DashboardPage', () => {
  it('greets the patient by name in the page heading', async () => {
    renderRoute('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: `${greetingFor(new Date())}, Ava` }),
    ).toBeInTheDocument();
    // The browser tab keeps the plain product name.
    expect(document.title).toBe('Mendwell');
  });

  it('features the next visit with clinician, timing and place', async () => {
    renderRoute('/');
    const card = await region('Next visit');

    expect(await within(card).findByRole('heading', { name: 'Dr. Maya Okafor, Cardiology' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Next visit · Video visit · in 2 days');
    expect(card).toHaveTextContent('Thu 15 Oct · 10:30 – 10:50');
    expect(card).toHaveTextContent('Medication check-in · Video visit');
    expect(within(card).getByRole('link', { name: 'View visit' })).toHaveAttribute('href', '/appointments/apt-005');
  });

  it('offers booking when nothing is coming up', async () => {
    writeDb((db) => {
      for (const appointment of db.appointments) {
        if (appointment.status === 'booked') appointment.status = 'cancelled';
      }
    });
    renderRoute('/');
    const card = await region('Next visit');

    expect(await within(card).findByText('No visits booked')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Book a visit' })).toHaveAttribute('href', '/appointments/book');
  });

  it('shows the latest reading of each vital with its status', async () => {
    renderRoute('/');
    const vitals = await region('Latest vitals');
    const tiles = await within(vitals).findAllByRole('link');

    expect(tiles.map((tile) => tile.getAttribute('href'))).toEqual([
      '/vitals?kind=blood-pressure',
      '/vitals?kind=heart-rate',
      '/vitals?kind=glucose',
      '/vitals?kind=weight',
    ]);
    expect(tiles[0]).toHaveTextContent('Blood pressure128/82 mmHg');
    expect(within(tiles[0]!).getByText('High (stage 1)')).toHaveAttribute('data-tone', 'warn');
    expect(tiles[0]).toHaveTextContent('Yesterday');
    expect(tiles[1]).toHaveTextContent('64 bpm');
    expect(within(tiles[1]!).getByText('In range')).toHaveAttribute('data-tone', 'ok');
    expect(tiles[3]).toHaveTextContent(/kg since first log/);
  });

  it('summarises blood pressure and switches between 30 and 90 days', async () => {
    const { user } = renderRoute('/');
    const card = await region('Blood pressure');

    const summary30 = await within(card).findByText(/^Average \d+\/\d+ mmHg over \d+ readings$/);
    const count30 = Number(/over (\d+) readings/.exec(summary30.textContent!)![1]);
    expect(within(card).getByRole('img', { name: /last 30 days/ })).toBeInTheDocument();

    await user.click(within(card).getByRole('radio', { name: '90d' }));

    expect(card).toHaveTextContent('Home readings, last 90 days');
    const summary90 = within(card).getByText(/^Average \d+\/\d+ mmHg over \d+ readings$/);
    expect(Number(/over (\d+) readings/.exec(summary90.textContent!)![1])).toBeGreaterThan(count30);
  });

  it('lists the latest results with plain-language status', async () => {
    renderRoute('/');
    const card = await region('Latest results');
    const rows = await within(card).findAllByRole('listitem');

    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Vitamin D, 25-hydroxy');
    expect(within(rows[0]!).getByText('Waiting for results')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Hemoglobin A1cNew');
    expect(within(rows[1]!).getByText('1 outside range')).toHaveAttribute('data-tone', 'warn');
    expect(within(card).getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/results');
  });

  it('lists to-dos with due dates when the care panel isn’t beside the page', async () => {
    setViewportWidth(1024);
    renderRoute('/');
    const card = await region('To do');

    expect(await within(card).findByText('Log today’s blood pressure')).toBeInTheDocument();
    expect(card).toHaveTextContent('Due today');
    expect(card).toHaveTextContent('5 things need you');
  });

  it('leaves to-dos to the care panel on wide screens', async () => {
    renderRoute('/');
    await region('Latest results');
    expect(within(screen.getByRole('main')).queryByRole('region', { name: 'To do' })).not.toBeInTheDocument();
    expect(await within(screen.getByRole('complementary', { name: 'Care panel' })).findByText('Log today’s blood pressure')).toBeInTheDocument();
  });

  it('shows a failure inside each card, and each card can retry on its own', async () => {
    configureApi({ failureRate: 1 });
    const { user } = renderRoute('/');

    const results = await region('Latest results');
    const resultsError = await within(results).findByRole('alert');
    expect(resultsError).toHaveTextContent("We couldn't load your results.");
    expect(await within(await region('Next visit')).findByRole('alert')).toHaveTextContent(
      "We couldn't load your next visit.",
    );

    configureApi({ failureRate: 0 });
    await user.click(within(resultsError).getByRole('button', { name: 'Try again' }));

    expect(await within(results).findByText('Vitamin D, 25-hydroxy')).toBeInTheDocument();
    // The other cards keep their own error until retried.
    expect(within(await region('Next visit')).getByRole('alert')).toBeInTheDocument();
  });
});
