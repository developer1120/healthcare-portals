import { screen, waitFor, within } from '@testing-library/react';
import { addHours, addMinutes } from 'date-fns';
import { api } from '@/api/endpoints';
import { getDb, writeDb } from '@/api/mockDb';
import { CLINIC_PHONE, LATE_CANCEL_FEE_CENTS, changePolicy } from '@/domain/appointmentPolicy';
import type { Appointment } from '@/domain/types';
import { formatTimeRange } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const AVA = 'pat-ava';
/** Ava's upcoming video visit with Dr. Okafor, two days after the test date. */
const VISIT = 'apt-005';

function visit(hoursAway: number, fields: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a',
    patientId: AVA,
    clinicianId: 'cln-okafor',
    start: addHours(now, hoursAway).toISOString(),
    durationMinutes: 20,
    mode: 'video',
    status: 'booked',
    reason: 'Check-in',
    location: 'Video visit',
    createdAt: now.toISOString(),
    ...fields,
  };
}

/** Moves Ava's visit to start `hoursAway` from now, keeping everything else. */
function moveVisit(hoursAway: number, fields: Partial<Appointment> = {}) {
  writeDb((db) => {
    Object.assign(db.appointments.find((a) => a.id === VISIT)!, {
      start: addHours(now, hoursAway).toISOString(),
      ...fields,
    });
  });
}

describe('changePolicy', () => {
  it('allows free changes more than 24 hours out', () => {
    const policy = changePolicy(visit(25), now);
    expect(policy).toMatchObject({ canCancel: true, canReschedule: true, lateCancellation: false });
    expect(policy.freeChangeDeadline).toEqual(addHours(now, 1));
  });

  it('turns cancellation late and rescheduling off inside 24 hours', () => {
    expect(changePolicy(visit(23.9), now)).toMatchObject({
      canCancel: true,
      canReschedule: false,
      lateCancellation: true,
      rescheduleBlock: 'within-cutoff',
    });
  });

  it('treats exactly 24 hours out as still free', () => {
    expect(changePolicy(visit(24), now)).toMatchObject({ canReschedule: true, lateCancellation: false });
  });

  it('caps online rescheduling but still allows cancelling', () => {
    expect(changePolicy(visit(48, { rescheduleCount: 2 }), now)).toMatchObject({
      canCancel: true,
      canReschedule: false,
      rescheduleBlock: 'limit-reached',
    });
  });

  it('allows nothing once the visit has started, is checked in, or is over', () => {
    expect(changePolicy(visit(-0.1), now)).toMatchObject({ canCancel: false, rescheduleBlock: 'started' });
    expect(changePolicy(visit(1, { status: 'checked-in' }), now).canCancel).toBe(false);
    expect(changePolicy(visit(48, { status: 'cancelled' }), now).canCancel).toBe(false);
  });
});

describe('cancel and reschedule endpoints', () => {
  async function freeSlot(exclude?: string) {
    const days = await api.availability.list('cln-okafor');
    return days.flatMap((d) => d.slots).find((s) => s !== exclude)!;
  }

  it('cancels for free outside the window', async () => {
    const before = getDb().statements.flatMap((s) => s.lines).length;
    const cancelled = await api.appointments.cancel({ patientId: AVA, appointmentId: VISIT, reason: 'Feeling better' });

    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'Feeling better', lateCancellation: false });
    expect(getDb().statements.flatMap((s) => s.lines)).toHaveLength(before);
    await expect(
      api.appointments.cancel({ patientId: AVA, appointmentId: VISIT, reason: 'Again' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('needs the fee accepted for a late cancellation, then bills it', async () => {
    moveVisit(3);
    await expect(
      api.appointments.cancel({ patientId: AVA, appointmentId: VISIT, reason: 'Schedule conflict' }),
    ).rejects.toMatchObject({ status: 400, message: 'Confirm the late cancellation fee to cancel within 24 hours.' });

    await api.appointments.cancel({ patientId: AVA, appointmentId: VISIT, reason: 'Schedule conflict', acceptLateFee: true });

    const fee = getDb()
      .statements.flatMap((s) => s.lines)
      .find((line) => line.description === 'Late cancellation fee');
    expect(fee?.chargeCents).toBe(LATE_CANCEL_FEE_CENTS);
  });

  it('treats another patient’s visit as not found', async () => {
    await expect(
      api.appointments.cancel({ patientId: 'pat-marcus', appointmentId: VISIT, reason: 'Nope' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('moves a visit, keeping its id and remembering where it was', async () => {
    const original = getDb().appointments.find((a) => a.id === VISIT)!.start;
    const start = await freeSlot();
    const moved = await api.appointments.reschedule({ patientId: AVA, appointmentId: VISIT, start, mode: 'in-person' });

    expect(moved).toMatchObject({
      id: VISIT,
      start,
      mode: 'in-person',
      location: 'Riverside Heart Clinic',
      rescheduleCount: 1,
      rescheduledFrom: original,
    });
  });

  it('refuses to move a visit inside the window or past the limit', async () => {
    const start = await freeSlot();
    moveVisit(5);
    await expect(
      api.appointments.reschedule({ patientId: AVA, appointmentId: VISIT, start, mode: 'video' }),
    ).rejects.toMatchObject({ status: 409, message: 'This visit can no longer be moved online. Call the clinic to change it.' });

    moveVisit(72, { rescheduleCount: 2 });
    await expect(
      api.appointments.reschedule({ patientId: AVA, appointmentId: VISIT, start, mode: 'video' }),
    ).rejects.toMatchObject({ message: 'This visit has been moved 2 times. Call the clinic to change it again.' });
  });

  it('refuses a time that is not free', async () => {
    await expect(
      api.appointments.reschedule({
        patientId: AVA,
        appointmentId: VISIT,
        start: addMinutes(new Date(await freeSlot()), 5).toISOString(),
        mode: 'video',
      }),
    ).rejects.toMatchObject({ status: 409, message: 'That time was just taken. Pick another time.' });
  });
});

describe('managing a visit', () => {
  it('explains the free-change deadline on an upcoming visit', async () => {
    renderRoute(`/appointments/${VISIT}`);
    const card = await screen.findByRole('region', { name: 'Need to change this visit?' });
    expect(card).toHaveTextContent(/Free to move or cancel until Wed 14 Oct, 10:30 \(24 hours before\)/);
    expect(within(card).getByRole('link', { name: 'Reschedule' })).toHaveAttribute(
      'href',
      `/appointments/${VISIT}/reschedule`,
    );
  });

  it('cancels through a dialog that asks for a reason', async () => {
    const { user } = renderRoute(`/appointments/${VISIT}`);
    await user.click(await screen.findByRole('button', { name: 'Cancel visit' }));

    const dialog = screen.getByRole('dialog', { name: 'Cancel this visit?' });
    expect(dialog).toHaveAccessibleDescription(/Medication check-in/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel visit' }));
    expect(within(dialog).getByRole('combobox', { name: /Reason/ })).toHaveAccessibleDescription('Choose a reason');

    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Reason/ }), 'Schedule conflict');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel visit' }));

    expect(await screen.findByText('Your visit is cancelled. Your care team has been told.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Cancelled', { selector: '[data-tone]' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Need to change this visit?' })).not.toBeInTheDocument();
    expect(getDb().appointments.find((a) => a.id === VISIT)).toMatchObject({
      status: 'cancelled',
      cancellationReason: 'Schedule conflict',
    });
  });

  it('asks for details when the reason is Other', async () => {
    const { user } = renderRoute(`/appointments/${VISIT}`);
    await user.click(await screen.findByRole('button', { name: 'Cancel visit' }));
    const dialog = screen.getByRole('dialog');

    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Reason/ }), 'Other');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel visit' }));

    expect(within(dialog).getByRole('textbox', { name: 'Tell us more' })).toHaveAccessibleDescription(
      'Tell us a little about why',
    );
  });

  it('closes the dialog with Escape or Keep visit and returns focus', async () => {
    const { user } = renderRoute(`/appointments/${VISIT}`);
    const trigger = await screen.findByRole('button', { name: 'Cancel visit' });

    await user.click(trigger);
    expect(within(screen.getByRole('dialog')).getByRole('combobox', { name: /Reason/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Keep visit' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getDb().appointments.find((a) => a.id === VISIT)!.status).toBe('booked');
  });

  it('keeps Tab inside the dialog', async () => {
    const { user } = renderRoute(`/appointments/${VISIT}`);
    await user.click(await screen.findByRole('button', { name: 'Cancel visit' }));
    const dialog = screen.getByRole('dialog');

    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('within 24 hours: offers a phone call instead of rescheduling and bills a late cancel', async () => {
    moveVisit(3);
    const { user } = renderRoute(`/appointments/${VISIT}`);
    const card = await screen.findByRole('region', { name: 'Need to change this visit?' });

    expect(card).toHaveTextContent('less than 24 hours away');
    expect(within(card).queryByRole('link', { name: 'Reschedule' })).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: `Call ${CLINIC_PHONE}` })).toHaveAttribute('href', 'tel:5035550100');

    await user.click(within(card).getByRole('button', { name: 'Cancel visit' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Reason/ }), 'Feeling better');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel visit' }));
    expect(within(dialog).getByText('Confirm the fee to cancel now')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: /\$25\.00 fee will be added/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel visit' }));

    expect(await screen.findByText(/Late cancellation: a \$25\.00 fee was added/)).toBeInTheDocument();
  });

  it('notes when the reschedule limit is reached', async () => {
    moveVisit(72, { rescheduleCount: 2 });
    renderRoute(`/appointments/${VISIT}`);
    const card = await screen.findByRole('region', { name: 'Need to change this visit?' });
    expect(card).toHaveTextContent('This visit has been moved 2 times.');
  });
});

describe('ReschedulePage', () => {
  it('moves a visit to a new time and confirms it', async () => {
    const original = getDb().appointments.find((a) => a.id === VISIT)!;
    const { user, router } = renderRoute(`/appointments/${VISIT}`);
    await user.click(await screen.findByRole('link', { name: 'Reschedule' }));

    expect(await screen.findByText(/Medication check-in with Dr. Maya Okafor/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move visit' }));
    expect(screen.getByText('Choose a new time.')).toBeInTheDocument();

    const times = within(await screen.findByRole('group', { name: /^Time on/ })).getAllByRole('radio');
    const slot = times[0] as HTMLInputElement;
    await user.click(slot);
    expect(screen.getByText(`New time: ${formatTimeRange(slot.value, 20)}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move visit' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/appointments/${VISIT}`));
    expect(await screen.findByText('Your visit has moved. We’ve updated your reminder.')).toBeInTheDocument();
    expect(await screen.findByText(formatTimeRange(original.start, 20))).toBeInTheDocument();
    expect(screen.getByText('Moved from')).toBeInTheDocument();
  });

  it('explains when the visit can no longer be moved online', async () => {
    moveVisit(2);
    renderRoute(`/appointments/${VISIT}/reschedule`);
    expect(await screen.findByText(/less than 24 hours away, so it can no longer be moved online/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move visit' })).not.toBeInTheDocument();
  });
});
