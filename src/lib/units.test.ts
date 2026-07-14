import {
  celsiusToFahrenheit,
  formatBloodPressure,
  formatFileSize,
  formatGlucose,
  formatMoney,
  formatWeight,
  kgToLb,
  lbToKg,
  mgDlToMmolL,
  mmolLToMgDl,
  round,
} from './units';

describe('round', () => {
  it('avoids floating-point leftovers', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(0.1 + 0.2, 2)).toBe(0.3);
    expect(round(72.45)).toBe(72);
  });
});

describe('conversions', () => {
  it('converts glucose between mg/dL and mmol/L', () => {
    expect(mgDlToMmolL(108)).toBe(6);
    expect(mgDlToMmolL(126)).toBe(7);
    expect(mmolLToMgDl(5.5)).toBe(99);
  });

  it('converts weight between kg and lb', () => {
    expect(kgToLb(73.2)).toBe(161.4);
    expect(lbToKg(161.4)).toBe(73.2);
  });

  it('converts temperature', () => {
    expect(celsiusToFahrenheit(37)).toBe(98.6);
    expect(celsiusToFahrenheit(38.5)).toBe(101.3);
  });
});

describe('display', () => {
  it('formats clinical values with units', () => {
    expect(formatBloodPressure(128, 82)).toBe('128/82 mmHg');
    expect(formatGlucose(108)).toBe('108 mg/dL');
    expect(formatGlucose(108, 'mmol/L')).toBe('6.0 mmol/L');
    expect(formatWeight(73.2)).toBe('73.2 kg');
    expect(formatWeight(73.2, 'lb')).toBe('161.4 lb');
  });

  it('formats money from cents, with credits as negatives', () => {
    expect(formatMoney(12_345)).toBe('$123.45');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(150_000)).toBe('$1,500.00');
    expect(formatMoney(-500)).toBe('−$5.00');
  });

  it('formats file sizes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(182_400)).toBe('178 KB');
    expect(formatFileSize(2_621_440)).toBe('2.5 MB');
  });
});
