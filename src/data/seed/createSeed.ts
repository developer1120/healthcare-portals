import { addMinutes, getDay } from 'date-fns';
import type {
  AccessLogEntry,
  Allergy,
  Appointment,
  CaregiverGrant,
  Clinician,
  ClinicalDocument,
  Condition,
  Consent,
  DoseLog,
  Id,
  Immunization,
  InsuranceCoverage,
  IsoDateTime,
  LabObservation,
  LabPanel,
  Medication,
  MessageThread,
  NotificationState,
  Patient,
  PatientTask,
  PaymentMethod,
  PaymentPlan,
  RefillRequest,
  ReminderPrefs,
  Statement,
  ThreadCategory,
  VitalReading,
} from '@/domain/types';
import { atTime, toIsoDate } from '@/lib/dates';
import { round } from '@/lib/units';
import { createRandom } from '../random';
import { PRIMARY_PATIENT_ID, clinicians, patients } from './people';

export interface SeedData {
  patients: Patient[];
  clinicians: Clinician[];
  appointments: Appointment[];
  threads: MessageThread[];
  labPanels: LabPanel[];
  medications: Medication[];
  refillRequests: RefillRequest[];
  doseLogs: DoseLog[];
  vitals: VitalReading[];
  allergies: Allergy[];
  conditions: Condition[];
  immunizations: Immunization[];
  documents: ClinicalDocument[];
  statements: Statement[];
  insurance: InsuranceCoverage[];
  paymentMethods: PaymentMethod[];
  paymentPlans: PaymentPlan[];
  reminderPrefs: ReminderPrefs[];
  notificationStates: NotificationState[];
  caregivers: CaregiverGrant[];
  consents: Consent[];
  accessLog: AccessLogEntry[];
  tasks: PatientTask[];
}

const AVA = PRIMARY_PATIENT_ID;

/**
 * Builds the demo dataset around `now`: past visits, results and readings sit
 * behind it and upcoming visits ahead of it, so the portal always looks current.
 * Output is deterministic for a given `now`.
 */
export function createSeed(now: Date): SeedData {
  const random = createRandom(20261013);
  const iso = (day: number, time: string): IsoDateTime => atTime(now, day, time).toISOString();
  const isoDate = (day: number): string => toIsoDate(atTime(now, day, '12:00'));
  const ago = (minutes: number): IsoDateTime => addMinutes(now, -minutes).toISOString();
  const clinician = (id: Id) => clinicians.find((c) => c.id === id)!;

  /** First day offset ≥ `from` (or ≤ for negative search) on which the clinician works. */
  function workday(clinicianId: Id, from: number, direction: 1 | -1 = 1): number {
    const days = new Set<number>(clinician(clinicianId).workingHours.map((h) => h.weekday));
    let offset = from;
    while (!days.has(getDay(atTime(now, offset, '12:00')))) offset += direction;
    return offset;
  }

  // ── Appointments ──────────────────────────────────────────────────────────
  let appointmentCount = 0;
  function appointment(
    patientId: Id,
    clinicianId: Id,
    day: number,
    time: string,
    fields: Partial<Appointment> & Pick<Appointment, 'reason'>,
  ): Appointment {
    const c = clinician(clinicianId);
    const start = atTime(now, day, time);
    const mode = fields.mode ?? 'in-person';
    return {
      id: `apt-${String(++appointmentCount).padStart(3, '0')}`,
      patientId,
      clinicianId,
      start: start.toISOString(),
      durationMinutes: c.slotMinutes,
      mode,
      status: start < now ? 'completed' : 'booked',
      location: mode === 'video' ? 'Video visit' : c.clinic,
      createdAt: addMinutes(start, -60 * 24 * 21).toISOString(),
      ...fields,
    };
  }

  const physicalDay = workday('cln-lindqvist', -30, -1);
  const okaforPastDay = workday('cln-okafor', -75, -1);
  const ferreiraPastDay = workday('cln-ferreira', -45, -1);
  const okaforNextDay = workday('cln-okafor', 2);

  const appointments: Appointment[] = [
    appointment(AVA, 'cln-okafor', okaforPastDay, '09:40', {
      reason: 'Blood pressure review',
      durationMinutes: 40,
    }),
    appointment(AVA, 'cln-ferreira', ferreiraPastDay, '14:00', { reason: 'Prediabetes follow-up', mode: 'video' }),
    appointment(AVA, 'cln-lindqvist', physicalDay, '08:40', { reason: 'Annual physical', durationMinutes: 40 }),
    appointment(AVA, 'cln-raman', workday('cln-raman', -20, -1), '11:00', {
      reason: 'Mole check',
      status: 'cancelled',
      cancelledAt: iso(-23, '18:05'),
      cancellationReason: 'Clinician unavailable',
    }),
    appointment(AVA, 'cln-okafor', okaforNextDay, '10:30', { reason: 'Medication check-in', mode: 'video' }),
    appointment(AVA, 'cln-lindqvist', workday('cln-lindqvist', 12), '09:20', { reason: 'Flu vaccine and BP check' }),
    appointment(AVA, 'cln-ferreira', workday('cln-ferreira', 26), '14:00', { reason: 'HbA1c follow-up' }),
  ];

  // A day of clinic for the two busiest clinicians, for the clinician views.
  const lindqvistDay = workday('cln-lindqvist', 0);
  const okaforDay = workday('cln-okafor', 0);
  const clinicDay: [Id, Id, number, string, string][] = [
    ['pat-marcus', 'cln-lindqvist', lindqvistDay, '08:00', 'Diabetes review'],
    ['pat-lucia', 'cln-lindqvist', lindqvistDay, '08:20', 'Persistent cough'],
    ['pat-dev', 'cln-lindqvist', lindqvistDay, '09:00', 'Sports injury, left knee'],
    ['pat-grace', 'cln-lindqvist', lindqvistDay, '09:40', 'Medication review'],
    ['pat-noor', 'cln-lindqvist', lindqvistDay, '10:20', 'Contraception consult'],
    ['pat-ethan', 'cln-lindqvist', lindqvistDay, '11:00', 'Headaches'],
    ['pat-mei', 'cln-lindqvist', lindqvistDay, '13:00', 'Fatigue'],
    ['pat-ruth', 'cln-lindqvist', lindqvistDay, '13:40', 'Fall follow-up'],
    ['pat-kai', 'cln-lindqvist', lindqvistDay, '14:20', 'Sleep problems'],
    ['pat-samir', 'cln-okafor', okaforDay, '08:30', 'Chest pain follow-up'],
    ['pat-olu', 'cln-okafor', okaforDay, '09:10', 'Echo results'],
    ['pat-grace', 'cln-okafor', okaforDay, '11:20', 'Atrial fibrillation review'],
    ['pat-mei', 'cln-okafor', okaforDay, '13:30', 'Palpitations'],
  ];
  for (const [patientId, clinicianId, day, time, reason] of clinicDay) {
    appointments.push(
      appointment(patientId, clinicianId, day, time, { reason, mode: reason === 'Echo results' ? 'video' : 'in-person' }),
    );
  }

  // Past visits across the panel, including two missed ones, for the roster's risk picture.
  const panelHistory: [Id, Id, number, string, string, Appointment['status']?][] = [
    ['pat-marcus', 'cln-lindqvist', -95, '08:40', 'Diabetes check'],
    ['pat-grace', 'cln-lindqvist', -40, '09:20', 'Kidney function review'],
    ['pat-lucia', 'cln-lindqvist', -150, '10:00', 'Asthma review'],
    ['pat-mei', 'cln-lindqvist', -200, '13:20', 'Thyroid follow-up'],
    ['pat-ruth', 'cln-lindqvist', -30, '10:40', 'Blood pressure check', 'no-show'],
    ['pat-ethan', 'cln-sato', -120, '15:00', 'Migraine follow-up', 'no-show'],
    ['pat-samir', 'cln-okafor', -100, '09:30', 'Angina review'],
    ['pat-olu', 'cln-okafor', -60, '10:10', 'Cholesterol review'],
  ];
  for (const [patientId, clinicianId, from, time, reason, status] of panelHistory) {
    appointments.push(appointment(patientId, clinicianId, workday(clinicianId, from, -1), time, { reason, ...(status && { status }) }));
  }

  // ── Vitals ────────────────────────────────────────────────────────────────
  const vitals: VitalReading[] = [];
  let vitalCount = 0;
  const vitalId = () => `vit-${String(++vitalCount).padStart(4, '0')}`;
  for (let day = -89; day <= -1; day++) {
    const progress = (day + 89) / 88; // 0 → 1 as lisinopril takes effect
    const takenAt = addMinutes(atTime(now, day, '07:30'), random.int(-20, 25)).toISOString();
    const isLast = day === -1;
    if (isLast || !random.chance(0.15)) {
      vitals.push({
        id: vitalId(),
        patientId: AVA,
        kind: 'blood-pressure',
        takenAt,
        source: 'home',
        systolic: isLast ? 128 : Math.round(137 - 9 * progress + random.jitter(5)),
        diastolic: isLast ? 82 : Math.round(87 - 5 * progress + random.jitter(3)),
      });
      vitals.push({
        id: vitalId(),
        patientId: AVA,
        kind: 'heart-rate',
        takenAt,
        source: 'home',
        bpm: isLast ? 64 : Math.round(66 - 2 * progress + random.jitter(4)),
      });
    }
    if (day % 7 === 0) {
      vitals.push({
        id: vitalId(),
        patientId: AVA,
        kind: 'weight',
        takenAt,
        source: 'home',
        kg: round(74.6 - 1.4 * progress + random.jitter(0.3), 1),
      });
    }
    if (day % 3 === 0) {
      vitals.push({
        id: vitalId(),
        patientId: AVA,
        kind: 'glucose',
        takenAt,
        source: 'device',
        context: 'fasting',
        mgPerDl: Math.round(109 - 6 * progress + random.jitter(5)),
      });
    }
  }
  vitals.push({
    id: vitalId(),
    patientId: AVA,
    kind: 'blood-pressure',
    takenAt: iso(physicalDay, '08:50'),
    source: 'clinic',
    systolic: 131,
    diastolic: 84,
    note: 'Seated, left arm, after 5 minutes rest.',
  });

  // The latest blood pressure for the rest of the panel.
  const panelBp: [Id, number, number, number, VitalReading['source']][] = [
    ['pat-marcus', -4, 136, 84, 'home'],
    ['pat-lucia', -150, 118, 76, 'clinic'],
    ['pat-dev', -200, 122, 78, 'clinic'],
    ['pat-grace', -1, 138, 78, 'home'],
    ['pat-samir', -6, 158, 96, 'home'],
    ['pat-noor', -90, 110, 70, 'clinic'],
    ['pat-ethan', -10, 142, 88, 'home'],
    ['pat-mei', -200, 116, 74, 'clinic'],
    ['pat-olu', -20, 136, 84, 'home'],
    ['pat-ruth', -3, 172, 98, 'home'],
    ['pat-kai', -60, 120, 80, 'clinic'],
  ];
  for (const [patientId, day, systolic, diastolic, source] of panelBp) {
    vitals.push({ id: vitalId(), patientId, kind: 'blood-pressure', takenAt: iso(day, '09:00'), source, systolic, diastolic });
  }

  // ── Labs ──────────────────────────────────────────────────────────────────
  const obs = (
    code: string,
    name: string,
    value: number,
    unit: string,
    range: Pick<LabObservation, 'refLow' | 'refHigh' | 'criticalLow' | 'criticalHigh'>,
  ): LabObservation => ({ code, name, value, unit, ...range });

  const hba1c = (value: number) => obs('4548-4', 'Hemoglobin A1c', value, '%', { refLow: 4, refHigh: 5.6 });
  const lipids = (total: number, ldl: number, hdl: number, tg: number) => [
    obs('2093-3', 'Total cholesterol', total, 'mg/dL', { refHigh: 200 }),
    obs('2089-1', 'LDL cholesterol', ldl, 'mg/dL', { refHigh: 100 }),
    obs('2085-9', 'HDL cholesterol', hdl, 'mg/dL', { refLow: 40 }),
    obs('2571-8', 'Triglycerides', tg, 'mg/dL', { refHigh: 150 }),
  ];
  const metabolic = (glucose: number, potassium: number, creatinine: number) => [
    obs('2345-7', 'Glucose', glucose, 'mg/dL', { refLow: 70, refHigh: 99, criticalLow: 50, criticalHigh: 400 }),
    obs('2951-2', 'Sodium', 139, 'mmol/L', { refLow: 136, refHigh: 145, criticalLow: 120, criticalHigh: 160 }),
    obs('2823-3', 'Potassium', potassium, 'mmol/L', { refLow: 3.5, refHigh: 5.1, criticalLow: 2.8, criticalHigh: 6.2 }),
    obs('2160-0', 'Creatinine', creatinine, 'mg/dL', { refLow: 0.59, refHigh: 1.04 }),
    obs('33914-3', 'eGFR', 92, 'mL/min/1.73m²', { refLow: 60 }),
  ];

  let panelCount = 0;
  function panel(
    patientId: Id,
    name: string,
    day: number,
    orderedById: Id,
    observations: LabObservation[],
    review?: { note: string; afterDays: number },
  ): LabPanel {
    const collectedAt = iso(day, '08:15');
    return {
      id: `lab-${String(++panelCount).padStart(3, '0')}`,
      patientId,
      name,
      orderedById,
      collectedAt,
      resultedAt: iso(day + 1, '16:40'),
      status: review ? 'reviewed' : 'final',
      observations,
      clinicianNote: review?.note,
      reviewedAt: review ? iso(day + review.afterDays, '11:00') : undefined,
      // Older, reviewed results have been seen; the latest batch is still new to the patient.
      patientViewedAt: review ? iso(day + review.afterDays, '19:30') : undefined,
    };
  }

  const recentLabDay = -9;
  const labPanels: LabPanel[] = [
    panel(AVA, 'Hemoglobin A1c', -180, 'cln-ferreira', [hba1c(6.1)], {
      note: 'In the prediabetes range. Let’s start metformin and recheck in three months.',
      afterDays: 3,
    }),
    panel(AVA, 'Lipid panel', -100, 'cln-okafor', lipids(236, 158, 49, 162), {
      note: 'LDL is high. Starting atorvastatin 20 mg at night.',
      afterDays: 2,
    }),
    panel(AVA, 'Hemoglobin A1c', -95, 'cln-ferreira', [hba1c(6.0)], {
      note: 'Small improvement. Keep going with metformin and the walking plan.',
      afterDays: 2,
    }),
    panel(AVA, 'Basic metabolic panel', -95, 'cln-ferreira', metabolic(112, 4.4, 0.84), {
      note: 'Kidney function and potassium are normal on lisinopril.',
      afterDays: 2,
    }),
    panel(
      AVA,
      'Complete blood count',
      physicalDay,
      'cln-lindqvist',
      [
        obs('718-7', 'Hemoglobin', 13.4, 'g/dL', { refLow: 12, refHigh: 15.5, criticalLow: 7, criticalHigh: 20 }),
        obs('6690-2', 'White blood cells', 6.2, '10³/µL', { refLow: 4, refHigh: 11 }),
        obs('777-3', 'Platelets', 248, '10³/µL', { refLow: 150, refHigh: 400, criticalLow: 50, criticalHigh: 1000 }),
      ],
      { note: 'All normal.', afterDays: 1 },
    ),
    panel(AVA, 'Hemoglobin A1c', recentLabDay, 'cln-ferreira', [hba1c(5.9)]),
    panel(AVA, 'Lipid panel', recentLabDay, 'cln-okafor', lipids(214, 142, 52, 148)),
    panel(AVA, 'Basic metabolic panel', recentLabDay, 'cln-ferreira', metabolic(108, 4.2, 0.86)),
    {
      id: `lab-${String(++panelCount).padStart(3, '0')}`,
      patientId: AVA,
      name: 'Vitamin D, 25-hydroxy',
      orderedById: 'cln-lindqvist',
      collectedAt: ago(26 * 60),
      status: 'pending',
      observations: [],
    },
    panel('pat-grace', 'Basic metabolic panel', -1, 'cln-lindqvist', metabolic(96, 6.4, 1.32)),
    panel('pat-marcus', 'Hemoglobin A1c', -4, 'cln-lindqvist', [hba1c(7.8)]),
    panel('pat-samir', 'Hemoglobin A1c', -12, 'cln-ferreira', [hba1c(9.6)], {
      note: 'Above target. Increasing metformin and adding a GLP-1; recheck in 3 months.',
      afterDays: 2,
    }),
    panel('pat-olu', 'Lipid panel', -20, 'cln-okafor', lipids(248, 170, 38, 210), {
      note: 'LDL above goal. Starting a statin.',
      afterDays: 1,
    }),
    panel('pat-ruth', 'Basic metabolic panel', -30, 'cln-lindqvist', metabolic(92, 4.4, 0.9), {
      note: 'Normal.',
      afterDays: 1,
    }),
  ];

  // ── Medications ───────────────────────────────────────────────────────────
  const medications: Medication[] = [
    {
      id: 'med-lisinopril',
      patientId: AVA,
      name: 'Lisinopril',
      strength: '10 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet by mouth once daily in the morning.',
      doseTimes: ['08:00'],
      asNeeded: false,
      prescriberId: 'cln-okafor',
      startDate: isoDate(okaforPastDay),
      status: 'active',
      refillsRemaining: 0,
      daysSupply: 30,
      lastFilledAt: iso(-27, '17:20'),
      pharmacy: 'Hawthorne Pharmacy, SE Hawthorne Blvd',
    },
    {
      id: 'med-metformin',
      patientId: AVA,
      name: 'Metformin',
      strength: '500 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet by mouth twice daily with breakfast and dinner.',
      doseTimes: ['08:00', '19:00'],
      asNeeded: false,
      prescriberId: 'cln-ferreira',
      startDate: isoDate(-177),
      status: 'active',
      refillsRemaining: 3,
      daysSupply: 90,
      lastFilledAt: iso(-41, '12:05'),
      pharmacy: 'Hawthorne Pharmacy, SE Hawthorne Blvd',
    },
    {
      id: 'med-atorvastatin',
      patientId: AVA,
      name: 'Atorvastatin',
      strength: '20 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet by mouth at bedtime.',
      doseTimes: ['21:30'],
      asNeeded: false,
      prescriberId: 'cln-okafor',
      startDate: isoDate(-98),
      status: 'active',
      refillsRemaining: 2,
      daysSupply: 90,
      lastFilledAt: iso(-8, '10:45'),
      pharmacy: 'Hawthorne Pharmacy, SE Hawthorne Blvd',
    },
    {
      id: 'med-cetirizine',
      patientId: AVA,
      name: 'Cetirizine',
      strength: '10 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet by mouth once daily as needed for hay fever.',
      doseTimes: [],
      asNeeded: true,
      prescriberId: 'cln-lindqvist',
      startDate: isoDate(-400),
      status: 'active',
      refillsRemaining: 5,
      daysSupply: 30,
      lastFilledAt: iso(-60, '15:00'),
      pharmacy: 'Hawthorne Pharmacy, SE Hawthorne Blvd',
    },
    {
      id: 'med-naproxen',
      patientId: AVA,
      name: 'Naproxen',
      strength: '250 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet twice daily with food for heel pain.',
      doseTimes: ['08:00', '20:00'],
      asNeeded: false,
      prescriberId: 'cln-lindqvist',
      startDate: isoDate(-420),
      endDate: isoDate(-380),
      status: 'stopped',
      refillsRemaining: 0,
      daysSupply: 30,
      lastFilledAt: iso(-420, '12:00'),
      pharmacy: 'Hawthorne Pharmacy, SE Hawthorne Blvd',
    },
    {
      id: 'med-marcus-atorvastatin',
      patientId: 'pat-marcus',
      name: 'Atorvastatin',
      strength: '40 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet by mouth at bedtime.',
      doseTimes: ['22:00'],
      asNeeded: false,
      prescriberId: 'cln-lindqvist',
      startDate: isoDate(-700),
      status: 'active',
      refillsRemaining: 0,
      daysSupply: 90,
      lastFilledAt: iso(-86, '09:30'),
      pharmacy: 'Fremont Community Pharmacy',
    },
    {
      id: 'med-samir-metformin',
      patientId: 'pat-samir',
      name: 'Metformin',
      strength: '1000 mg',
      form: 'tablet',
      instructions: 'Take 1 tablet by mouth twice daily with meals.',
      doseTimes: ['08:00', '19:00'],
      asNeeded: false,
      prescriberId: 'cln-ferreira',
      startDate: isoDate(-1200),
      status: 'active',
      refillsRemaining: 0,
      daysSupply: 90,
      lastFilledAt: iso(-88, '13:10'),
      pharmacy: 'Fremont Community Pharmacy',
    },
  ];
  // Regular medicines for the rest of the panel, as the clinician chart shows them.
  const panelMedications: [Id, string, string, string, string[], Id, number][] = [
    ['pat-grace', 'Apixaban', '5 mg', 'Take 1 tablet by mouth twice daily.', ['08:00', '20:00'], 'cln-okafor', -30],
    ['pat-grace', 'Metoprolol succinate', '25 mg', 'Take 1 tablet by mouth once daily.', ['08:00'], 'cln-okafor', -30],
    ['pat-grace', 'Furosemide', '20 mg', 'Take 1 tablet by mouth every morning.', ['08:00'], 'cln-lindqvist', -12],
    ['pat-marcus', 'Metformin', '1000 mg', 'Take 1 tablet by mouth twice daily with meals.', ['08:00', '19:00'], 'cln-lindqvist', -40],
    ['pat-marcus', 'Lisinopril', '20 mg', 'Take 1 tablet by mouth once daily.', ['08:00'], 'cln-lindqvist', -40],
    ['pat-ruth', 'Alendronate', '70 mg', 'Take 1 tablet weekly with a full glass of water, 30 minutes before food.', ['07:00'], 'cln-lindqvist', -50],
    ['pat-ruth', 'Amlodipine', '5 mg', 'Take 1 tablet by mouth once daily.', ['08:00'], 'cln-lindqvist', -50],
    ['pat-samir', 'Aspirin', '81 mg', 'Take 1 tablet by mouth once daily.', ['08:00'], 'cln-okafor', -60],
    ['pat-mei', 'Levothyroxine', '75 mcg', 'Take 1 tablet on an empty stomach every morning.', ['06:30'], 'cln-lindqvist', -85],
    ['pat-lucia', 'Fluticasone inhaler', '110 mcg', 'Inhale 2 puffs twice daily. Rinse mouth after use.', ['08:00', '20:00'], 'cln-lindqvist', -80],
  ];
  for (const [patientId, name, strength, instructions, doseTimes, prescriberId, filledDay] of panelMedications) {
    medications.push({
      id: `med-${patientId.slice(4)}-${name.split(' ')[0]!.toLowerCase()}`,
      patientId,
      name,
      strength,
      form: name.includes('inhaler') ? 'inhaler' : 'tablet',
      instructions,
      doseTimes,
      asNeeded: false,
      prescriberId,
      startDate: isoDate(-400),
      status: 'active',
      refillsRemaining: 3,
