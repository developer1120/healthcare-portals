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
      daysSupply: 90,
      lastFilledAt: iso(filledDay, '10:00'),
      pharmacy: 'Fremont Community Pharmacy',
    });
  }

  const refillRequests: RefillRequest[] = [
    {
      id: 'rfl-001',
      medicationId: 'med-metformin',
      patientId: AVA,
      requestedAt: iso(-44, '19:12'),
      status: 'approved',
      decidedAt: iso(-43, '10:02'),
      decidedById: 'cln-ferreira',
      decisionNote: 'Approved for 90 days with 3 refills.',
    },
    {
      id: 'rfl-002',
      medicationId: 'med-marcus-atorvastatin',
      patientId: 'pat-marcus',
      requestedAt: ago(5 * 60),
      status: 'pending',
      patientNote: 'Running out on Friday.',
    },
    {
      id: 'rfl-003',
      medicationId: 'med-samir-metformin',
      patientId: 'pat-samir',
      requestedAt: ago(28 * 60),
      status: 'pending',
    },
    {
      id: 'rfl-004',
      medicationId: 'med-lucia-fluticasone',
      patientId: 'pat-lucia',
      requestedAt: ago(2 * 60),
      status: 'pending',
      patientNote: 'Down to my last few puffs.',
      pharmacy: 'Fremont Community Pharmacy',
    },
    {
      id: 'rfl-005',
      medicationId: 'med-mei-levothyroxine',
      patientId: 'pat-mei',
      requestedAt: ago(5 * 1440 + 90),
      status: 'pending',
      pharmacy: 'Fremont Community Pharmacy',
    },
  ];

  // Dose history for the last two weeks of Ava's scheduled medicines.
  const doseLogs: DoseLog[] = [];
  let doseCount = 0;
  for (const medication of medications.filter((m) => m.patientId === AVA && m.status === 'active' && !m.asNeeded)) {
    for (let day = -14; day <= 0; day++) {
      for (const time of medication.doseTimes) {
        const scheduled = atTime(now, day, time);
        if (scheduled > now) continue;
        const roll = random.next();
        if (roll < 0.06) continue; // missed: no entry at all
        doseLogs.push({
          id: `dose-${String(++doseCount).padStart(4, '0')}`,
          medicationId: medication.id,
          scheduledFor: scheduled.toISOString(),
          skipped: roll < 0.09,
          takenAt: roll < 0.09 ? undefined : addMinutes(scheduled, random.int(-15, 40)).toISOString(),
        });
      }
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  const threads: MessageThread[] = [
    {
      id: 'thr-results',
      patientId: AVA,
      subject: 'Your lab results are ready',
      category: 'results',
      assigneeId: 'cln-delgado',
      archived: false,
      clinicianReadAt: ago(170),
      messages: [
        {
          id: 'msg-101',
          threadId: 'thr-results',
          authorId: 'cln-delgado',
          body:
            'Hi Ava, your HbA1c, lipid panel and metabolic panel from last week are back. Dr. Ferreira will add notes, ' +
            'but nothing needs urgent action. Your A1c has come down again, nice work.',
          sentAt: ago(170),
          attachments: [],
        },
      ],
    },
    {
      id: 'thr-dizzy',
      patientId: AVA,
      subject: 'Lightheaded in the mornings',
      category: 'clinical',
      assigneeId: 'cln-okafor',
      archived: false,
      patientReadAt: iso(-11, '18:30'),
      clinicianReadAt: iso(-12, '15:10'),
      messages: [
        {
          id: 'msg-201',
          threadId: 'thr-dizzy',
          authorId: AVA,
          body:
            'Since the lisinopril dose went up I sometimes feel lightheaded when I get out of bed. It passes after a ' +
            'minute. Is this normal?',
          sentAt: iso(-13, '07:52'),
          attachments: [],
        },
        {
          id: 'msg-202',
          threadId: 'thr-dizzy',
          authorId: 'cln-okafor',
          body:
            'Thanks for letting me know. This can happen in the first weeks. Sit on the edge of the bed for a minute ' +
            'before standing, and keep logging your morning readings. If you faint or it gets worse, call the clinic.',
          sentAt: iso(-12, '15:08'),
          attachments: [],
        },
        {
          id: 'msg-203',
          threadId: 'thr-dizzy',
          authorId: AVA,
          body: 'That helps, thank you. Here is this week’s log.',
          sentAt: iso(-11, '18:29'),
          attachments: [{ id: 'att-1', name: 'bp-log-week-6.pdf', sizeBytes: 182_400, mimeType: 'application/pdf' }],
        },
      ],
    },
    {
      id: 'thr-metformin',
      patientId: AVA,
      subject: 'Metformin refill',
      category: 'refill',
      assigneeId: 'cln-ferreira',
      archived: true,
      patientReadAt: iso(-43, '12:00'),
      clinicianReadAt: iso(-43, '10:00'),
      messages: [
        {
          id: 'msg-301',
          threadId: 'thr-metformin',
          authorId: AVA,
          body: 'I’m down to my last week of metformin. Could you send a refill to Hawthorne Pharmacy?',
          sentAt: iso(-44, '19:12'),
          attachments: [],
        },
        {
          id: 'msg-302',
          threadId: 'thr-metformin',
          authorId: 'cln-ferreira',
          body: 'Done, 90 days with three refills. It should be ready tomorrow afternoon.',
          sentAt: iso(-43, '10:02'),
          attachments: [],
        },
      ],
    },
    {
      id: 'thr-billing',
      patientId: AVA,
      subject: 'Question about my statement',
      category: 'billing',
      assigneeId: 'cln-brooks',
      archived: false,
      patientReadAt: iso(-6, '20:15'),
      clinicianReadAt: iso(-6, '09:30'),
      messages: [
        {
          id: 'msg-401',
          threadId: 'thr-billing',
          authorId: AVA,
          body: 'My statement shows a lab charge from the physical. Wasn’t that covered as preventive care?',
          sentAt: iso(-7, '21:03'),
          attachments: [],
        },
        {
          id: 'msg-402',
          threadId: 'thr-billing',
          authorId: 'cln-brooks',
          body:
            'The physical itself was preventive, but the A1c is a diagnostic test because of your prediabetes, so ' +
            'it goes towards your deductible. I can set up a payment plan if that helps.',
          sentAt: iso(-6, '09:41'),
          attachments: [],
        },
      ],
    },
  ];

  // Messages from the rest of the panel, for the clinician inbox. Times are minutes ago.
  const panelThreads: [Id, Id, string, ThreadCategory, Id, [Id, number, string][], number?][] = [
    ['thr-ethan-headache', 'pat-ethan', 'Worst headache of my life', 'clinical', 'cln-lindqvist', [
      ['pat-ethan', 35, 'I’ve had the worst headache of my life since I woke up, and the vision in my right eye is blurry. Tylenol hasn’t touched it.'],
    ]],
    ['thr-ruth-fall', 'pat-ruth', 'I fell again', 'clinical', 'cln-lindqvist', [
      ['pat-ruth', 130, 'I slipped getting out of the bath this morning. My right hip hurts when I stand on it and I feel a bit dizzy. My daughter is with me.'],
    ]],
    ['thr-mei-tired', 'pat-mei', 'Still exhausted', 'clinical', 'cln-lindqvist', [
      ['pat-mei', 12 * 1440, 'I’m tired all the time and my hair is thinning. Could it be my thyroid again?'],
      ['cln-lindqvist', 11 * 1440, 'It could be. I’ve restarted levothyroxine at 75 mcg. We’ll recheck your TSH in six weeks.'],
      ['pat-mei', 5 * 1440, 'It’s been a week and I’m still exhausted by mid-afternoon. Is that normal, or should I come in?'],
    ], 4 * 1440],
    ['thr-marcus-sugars', 'pat-marcus', 'High morning sugars', 'clinical', 'cln-lindqvist', [
      ['pat-marcus', 26 * 60, 'My fasting sugars have been 190 to 230 all week. I’m taking the metformin twice a day like you said. Should I be doing something different?'],
    ], 20 * 60],
    ['thr-kai-melatonin', 'pat-kai', 'Melatonin while I wait', 'general', 'cln-lindqvist', [
      ['pat-kai', 22 * 60, 'Is it OK to take melatonin while I wait for my sleep appointment? Nothing else seems to help.'],
    ]],
    ['thr-lucia-inhaler', 'pat-lucia', 'Inhaler running low', 'refill', 'cln-lindqvist', [
      ['pat-lucia', 180, 'I’m down to my last few puffs of the fluticasone. Could you send a refill to Fremont Community Pharmacy?'],
    ]],
    ['thr-grace-furosemide', 'pat-grace', 'When to take the water pill', 'clinical', 'cln-lindqvist', [
      ['pat-grace', 2 * 1440, 'Should I take the furosemide in the morning or at night?'],
      ['cln-lindqvist', 1440 + 300, 'Mornings, please. At night it will keep you up going to the bathroom. Weigh yourself each morning and let me know if you gain more than 2 lb in a day.'],
    ], 1440 + 300],
    ['thr-dev-knee', 'pat-dev', 'Knee still sore', 'clinical', 'cln-delgado', [
      ['pat-dev', 300, 'My knee is still sore a week after the injury. Should I keep icing it, or switch to heat?'],
    ]],
  ];
  for (const [id, patientId, subject, category, assigneeId, messages, readMinutesAgo] of panelThreads) {
    threads.push({
      id,
      patientId,
      subject,
      category,
      assigneeId,
      archived: false,
      clinicianReadAt: readMinutesAgo === undefined ? undefined : ago(readMinutesAgo),
      patientReadAt: ago(Math.min(...messages.map(([, minutes]) => minutes)) - 1),
      messages: messages.map(([authorId, minutes, body], index) => ({
        id: `msg-${id.slice(4)}-${index + 1}`,
        threadId: id,
        authorId,
        body,
        sentAt: ago(minutes),
        attachments: [],
      })),
    });
  }

  // ── Health record ─────────────────────────────────────────────────────────
  const allergies: Allergy[] = [
    { id: 'alg-1', patientId: AVA, substance: 'Penicillin', reaction: 'Hives', severity: 'moderate', recordedAt: '2009-07-14' },
    { id: 'alg-2', patientId: AVA, substance: 'Latex', reaction: 'Skin rash', severity: 'mild', recordedAt: '2016-02-03' },
    { id: 'alg-3', patientId: 'pat-grace', substance: 'Sulfonamide antibiotics', reaction: 'Widespread rash', severity: 'moderate', recordedAt: '2011-03-08', reportedBy: 'clinician', verified: true },
    { id: 'alg-4', patientId: 'pat-ruth', substance: 'Codeine', reaction: 'Nausea and confusion', severity: 'mild', recordedAt: '2018-10-22', reportedBy: 'clinician', verified: true },
    { id: 'alg-5', patientId: 'pat-marcus', substance: 'Shellfish', reaction: 'Throat swelling', severity: 'severe', recordedAt: '2005-07-01', reportedBy: 'patient', verified: true },
  ];

  const conditions: Condition[] = [
    { id: 'cnd-1', patientId: AVA, name: 'Essential hypertension', code: 'I10', status: 'active', onset: isoDate(okaforPastDay - 30) },
    { id: 'cnd-2', patientId: AVA, name: 'Prediabetes', code: 'R73.03', status: 'active', onset: isoDate(-180) },
    { id: 'cnd-3', patientId: AVA, name: 'Seasonal allergic rhinitis', code: 'J30.2', status: 'active', onset: '2012-05-01' },
    {
      id: 'cnd-4',
      patientId: AVA,
      name: 'Plantar fasciitis',
      code: 'M72.2',
      status: 'resolved',
      onset: isoDate(-430),
      resolvedOn: isoDate(-360),
    },
  ];
  const panelConditions: [Id, string, string, string][] = [
    ['pat-marcus', 'Type 2 diabetes mellitus', 'E11.9', '2014-03-10'],
    ['pat-marcus', 'Hyperlipidemia', 'E78.5', '2012-08-22'],
    ['pat-marcus', 'Essential hypertension', 'I10', '2016-01-15'],
    ['pat-lucia', 'Mild persistent asthma', 'J45.30', '2003-09-01'],
    ['pat-grace', 'Atrial fibrillation', 'I48.91', '2019-06-04'],
    ['pat-grace', 'Chronic kidney disease, stage 3a', 'N18.31', '2021-11-30'],
    ['pat-grace', 'Essential hypertension', 'I10', '2008-02-12'],
    ['pat-grace', 'Heart failure with preserved ejection fraction', 'I50.30', '2023-04-18'],
    ['pat-samir', 'Type 2 diabetes mellitus', 'E11.9', '2011-05-20'],
    ['pat-samir', 'Coronary artery disease', 'I25.10', '2020-10-02'],
    ['pat-samir', 'Essential hypertension', 'I10', '2013-07-07'],
    ['pat-ethan', 'Migraine without aura', 'G43.009', '2018-02-14'],
    ['pat-mei', 'Hypothyroidism', 'E03.9', '2017-09-09'],
    ['pat-olu', 'Essential hypertension', 'I10', '2015-12-01'],
    ['pat-olu', 'Hyperlipidemia', 'E78.5', '2019-03-03'],
    ['pat-ruth', 'Osteoporosis', 'M81.0', '2010-04-26'],
    ['pat-ruth', 'Essential hypertension', 'I10', '2002-06-30'],
    ['pat-ruth', 'History of falling', 'Z91.81', isoDate(-45)],
    ['pat-kai', 'Insomnia', 'G47.00', '2024-01-11'],
  ];
  panelConditions.forEach(([patientId, name, code, onset], index) =>
    conditions.push({ id: `cnd-${index + 5}`, patientId, name, code, status: 'active', onset }),
  );

  const immunizations: Immunization[] = [
    { id: 'imm-1', patientId: AVA, vaccine: 'Influenza (seasonal)', givenOn: isoDate(-371), site: 'Left deltoid', nextDueOn: isoDate(-6) },
    { id: 'imm-2', patientId: AVA, vaccine: 'COVID-19 (2025–26 formula)', givenOn: isoDate(-330), site: 'Right deltoid' },
    { id: 'imm-3', patientId: AVA, vaccine: 'Tdap', givenOn: '2019-05-22', site: 'Left deltoid', nextDueOn: '2029-05-22' },
    { id: 'imm-4', patientId: AVA, vaccine: 'Hepatitis B', dose: 'Dose 3 of 3', givenOn: '2003-11-10' },
  ];

  const documents: ClinicalDocument[] = [
    {
      id: 'doc-1',
      patientId: AVA,
      appointmentId: appointments[2]!.id,
      kind: 'visit-summary',
      title: 'Annual physical',
      authorId: 'cln-lindqvist',
      createdAt: iso(physicalDay, '12:10'),
      sections: [
        { heading: 'Reason for visit', body: 'Yearly preventive check-up.' },
        {
          heading: 'What we found',
          body: 'Blood pressure 131/84 in clinic, improving on lisinopril. Weight down 1.2 kg since spring. Exam otherwise normal.',
        },
        { heading: 'Plan', body: 'Repeat A1c and lipids in three weeks. Flu vaccine at the next visit. Keep logging BP at home.' },
      ],
    },
    {
      id: 'doc-2',
      patientId: AVA,
      appointmentId: appointments[0]!.id,
      kind: 'visit-summary',
      title: 'Blood pressure review',
      authorId: 'cln-okafor',
      createdAt: iso(okaforPastDay, '13:30'),
      sections: [
        { heading: 'Reason for visit', body: 'Raised home readings over two months (average 137/87).' },
        { heading: 'Plan', body: 'Start lisinopril 10 mg each morning. Echocardiogram to rule out structural causes. Review in 10 weeks.' },
      ],
    },
    {
      id: 'doc-3',
      patientId: AVA,
      kind: 'imaging',
      title: 'Transthoracic echocardiogram',
      authorId: 'cln-okafor',
      createdAt: iso(okaforPastDay + 6, '15:00'),
      sections: [
        { heading: 'Findings', body: 'Normal left ventricular size and function. Ejection fraction 62%. No valve disease.' },
        { heading: 'Impression', body: 'Normal study.' },
      ],
    },
    {
      id: 'doc-4',
      patientId: AVA,
      kind: 'referral',
      title: 'Referral to endocrinology',
      authorId: 'cln-lindqvist',
      createdAt: iso(-185, '10:20'),
      sections: [{ heading: 'Reason', body: 'HbA1c 6.1% with family history of type 2 diabetes. Please advise on prevention.' }],
    },
  ];

  // ── Billing and insurance ─────────────────────────────────────────────────
  const statements: Statement[] = [
    {
      id: 'stm-2026-08',
      patientId: AVA,
      issuedAt: isoDate(-62),
      dueOn: isoDate(-32),
      lines: [
        {
          id: 'stl-1',
          description: 'Specialist video visit, endocrinology',
          serviceDate: isoDate(ferreiraPastDay),
          chargeCents: 18_500,
          insurancePaidCents: 15_000,
          adjustmentCents: 2_000,
        },
      ],
      payments: [{ id: 'pay-1', paidAt: iso(-40, '20:14'), amountCents: 1_500, method: 'card' }],
    },
    {
      id: 'stm-2026-10',
      patientId: AVA,
      issuedAt: isoDate(-10),
      dueOn: isoDate(20),
      lines: [
        {
          id: 'stl-2',
          description: 'Preventive visit, established patient',
          serviceDate: isoDate(physicalDay),
          chargeCents: 24_500,
          insurancePaidCents: 22_000,
          adjustmentCents: 2_500,
        },
        {
          id: 'stl-3',
          description: 'Hemoglobin A1c',
          serviceDate: isoDate(physicalDay),
          chargeCents: 6_800,
          insurancePaidCents: 2_000,
          adjustmentCents: 1_300,
        },
        {
          id: 'stl-4',
          description: 'Lipid panel',
          serviceDate: isoDate(physicalDay),
          chargeCents: 5_400,
          insurancePaidCents: 1_800,
          adjustmentCents: 1_000,
        },
      ],
      payments: [],
    },
  ];

  const year = now.getFullYear();
  const insurance: InsuranceCoverage[] = [
    {
      id: 'ins-1',
      patientId: AVA,
      payer: 'Cedarline Health',
      plan: 'Cedarline Silver PPO',
      memberId: 'CDL-4821-7730',
      groupNumber: 'G-20931',
      priority: 'primary',
      copayCents: { 'primary-care': 2_500, specialist: 5_000, video: 1_500 },
      deductibleCents: 150_000,
      deductibleMetCents: 112_000,
      outOfPocketMaxCents: 600_000,
      outOfPocketMetCents: 184_500,
      coinsurance: 0.2,
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
    },
  ];

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const nextVideo = appointments.find((a) => a.patientId === AVA && a.mode === 'video' && a.status === 'booked')!;
  const tasks: PatientTask[] = [
    { id: 'tsk-1', patientId: AVA, kind: 'log-vitals', title: 'Log today’s blood pressure', dueAt: iso(0, '23:59'), href: '/vitals' },
    { id: 'tsk-2', patientId: AVA, kind: 'refill', title: 'Request a lisinopril refill', dueAt: iso(3, '17:00'), href: '/medications', relatedId: 'med-lisinopril' },
    {
      id: 'tsk-3',
      patientId: AVA,
      kind: 'pre-check',
      title: 'Pre-check in for your video visit',
      dueAt: nextVideo.start,
      href: `/appointments/${nextVideo.id}/check-in`,
    },
    { id: 'tsk-4', patientId: AVA, kind: 'read-result', title: 'Review your new lab results', href: '/results' },
    { id: 'tsk-5', patientId: AVA, kind: 'payment', title: 'Pay your October statement', dueAt: iso(20, '23:59'), href: '/billing' },
    {
      id: 'tsk-6',
      patientId: AVA,
      kind: 'form',
      title: 'Complete the health questionnaire',
      completedAt: ago(2 * 24 * 60 + 90),
      href: '/records',
    },
  ];

  return {
    // Copies, so changes made through the mock API never leak into the next seed.
    patients: structuredClone(patients),
    clinicians: structuredClone(clinicians),
    appointments,
    threads,
    labPanels,
    medications,
    refillRequests,
    doseLogs,
    vitals,
    allergies,
    conditions,
    immunizations,
    documents,
    statements,
    insurance,
    paymentMethods: [
      { id: 'pm-card', patientId: AVA, kind: 'card', label: 'Visa', last4: '4242' },
      { id: 'pm-bank', patientId: AVA, kind: 'bank', label: 'Checking', last4: '6789' },
    ],
    paymentPlans: [],
    reminderPrefs: [
      { patientId: AVA, appointmentLeadHours: 24, medicationReminders: true, billingReminders: true, email: true, sms: false },
    ],
    notificationStates: [],
    caregivers: [
      {
        id: 'cg-1',
        patientId: AVA,
        name: 'Mia Thompson',
        email: 'mia.thompson@example.com',
        relationship: 'Sister',
        scopes: ['appointments', 'messages'],
        status: 'active',
        invitedAt: iso(-62, '19:10'),
        acceptedAt: iso(-61, '08:45'),
      },
    ],
    consents: [
      { patientId: AVA, kind: 'records-exchange', granted: true, updatedAt: iso(-400, '10:00') },
      { patientId: AVA, kind: 'research', granted: false, updatedAt: iso(-400, '10:00') },
      { patientId: AVA, kind: 'surveys', granted: true, updatedAt: iso(-400, '10:00') },
    ],
    accessLog: [
      { id: 'log-1', patientId: AVA, actorId: 'cln-ferreira', action: 'viewed-chart', at: iso(ferreiraPastDay, '13:52') },
      { id: 'log-2', patientId: AVA, actorId: 'cln-okafor', action: 'replied-message', at: iso(-12, '15:08') },
      { id: 'log-3', patientId: AVA, actorId: 'cln-brooks', action: 'updated-billing', at: iso(-6, '09:41') },
      { id: 'log-4', patientId: AVA, actorId: 'cln-delgado', action: 'reviewed-results', at: ago(180) },
    ],
    tasks,
  };
}
