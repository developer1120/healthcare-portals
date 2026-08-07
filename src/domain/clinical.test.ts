import { flagDisplay, flagObservation, formatReferenceRange, isCritical, summarizePanel } from './labs';
import type { LabObservation, LabPanel } from './types';
import { assessBloodPressure, assessGlucose, assessHeartRate, assessReading, bmi } from './vitals';

describe('assessBloodPressure', () => {
  it.each([
    [118, 76, 'normal', 'ok'],
    [124, 78, 'elevated', 'warn'],
    [128, 82, 'stage-1', 'warn'],
    [118, 85, 'stage-1', 'warn'],
    [134, 79, 'stage-1', 'warn'],
    [142, 88, 'stage-2', 'critical'],
    [128, 92, 'stage-2', 'critical'],
    [185, 100, 'crisis', 'critical'],
    [150, 125, 'crisis', 'critical'],
    [86, 58, 'low', 'warn'],
  ])('%i/%i is %s', (systolic, diastolic, band, tone) => {
    expect(assessBloodPressure(systolic, diastolic)).toMatchObject({ band, tone });
  });

  it('uses the band edges from the guideline', () => {
    expect(assessBloodPressure(119, 79).band).toBe('normal');
    expect(assessBloodPressure(120, 79).band).toBe('elevated');
    expect(assessBloodPressure(130, 79).band).toBe('stage-1');
    expect(assessBloodPressure(140, 79).band).toBe('stage-2');
    expect(assessBloodPressure(180, 120).band).toBe('stage-2');
  });
});

describe('assessHeartRate', () => {
  it.each([
    [64, 'normal'],
    [100, 'normal'],
    [101, 'high'],
    [48, 'low'],
    [38, 'critical'],
    [140, 'critical'],
  ])('%i bpm is %s', (bpm, band) => {
    expect(assessHeartRate(bpm).band).toBe(band);
  });
});

describe('assessGlucose', () => {
  it('holds fasting readings to a tighter target than after-meal ones', () => {
    expect(assessGlucose(108, 'fasting').band).toBe('high');
    expect(assessGlucose(108, 'after-meal').band).toBe('normal');
    expect(assessGlucose(185, 'after-meal').band).toBe('high');
  });

  it('flags lows and very lows whatever the context', () => {
    expect(assessGlucose(65, 'after-meal')).toMatchObject({ band: 'low', tone: 'warn' });
    expect(assessGlucose(50, 'fasting')).toMatchObject({ band: 'very-low', tone: 'critical' });
    expect(assessGlucose(320, 'random')).toMatchObject({ band: 'very-high', tone: 'critical' });
  });
});

describe('assessReading', () => {
  const base = { id: 'v', patientId: 'p', takenAt: '2026-10-12T07:30:00Z', source: 'home' as const };

  it('dispatches on the reading kind', () => {
    expect(assessReading({ ...base, kind: 'blood-pressure', systolic: 128, diastolic: 82 })?.band).toBe('stage-1');
    expect(assessReading({ ...base, kind: 'heart-rate', bpm: 64 })?.band).toBe('normal');
    expect(assessReading({ ...base, kind: 'glucose', mgPerDl: 92, context: 'fasting' })?.band).toBe('normal');
  });

  it('has no band for weight', () => {
    expect(assessReading({ ...base, kind: 'weight', kg: 73.2 })).toBeNull();
  });

  it('computes BMI', () => {
    expect(bmi(73.2, 168)).toBeCloseTo(25.9, 1);
  });
});

describe('lab flags', () => {
  const potassium = (value: number): LabObservation => ({
    code: '2823-3',
    name: 'Potassium',
    value,
    unit: 'mmol/L',
    refLow: 3.5,
    refHigh: 5.1,
    criticalLow: 2.8,
    criticalHigh: 6.2,
  });

  it.each([
    [4.2, 'normal'],
    [3.5, 'normal'],
    [5.1, 'normal'],
    [3.2, 'low'],
    [5.6, 'high'],
    [2.5, 'critical-low'],
    [6.4, 'critical-high'],
  ])('potassium %f is %s', (value, flag) => {
    expect(flagObservation(potassium(value))).toBe(flag);
  });

  it('handles one-sided ranges', () => {
    const ldl: LabObservation = { code: '2089-1', name: 'LDL', value: 142, unit: 'mg/dL', refHigh: 100 };
    const hdl: LabObservation = { code: '2085-9', name: 'HDL', value: 38, unit: 'mg/dL', refLow: 40 };
    expect(flagObservation(ldl)).toBe('high');
    expect(flagObservation(hdl)).toBe('low');
    expect(formatReferenceRange(ldl)).toBe('< 100 mg/dL');
    expect(formatReferenceRange(hdl)).toBe('> 40 mg/dL');
    expect(formatReferenceRange(potassium(4))).toBe('3.5–5.1 mmol/L');
    expect(formatReferenceRange({ ...ldl, refHigh: undefined })).toBe('');
  });

  it('labels every flag and marks only the critical ones', () => {
    expect(flagDisplay['critical-high']).toEqual({ label: 'Critically high', tone: 'critical' });
    expect(isCritical('critical-low')).toBe(true);
    expect(isCritical('high')).toBe(false);
  });

  it('summarises a panel', () => {
    const panel = {
      observations: [potassium(4.2), potassium(5.6), potassium(6.4)],
    } as LabPanel;
    expect(summarizePanel(panel)).toEqual({ outOfRange: 2, critical: true });
  });
});
