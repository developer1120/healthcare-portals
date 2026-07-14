/** Unit conversion and display helpers for clinical values and money. */

const MG_DL_PER_MMOL_L = 18.016;
const LB_PER_KG = 2.20462;

export function mgDlToMmolL(mgPerDl: number): number {
  return round(mgPerDl / MG_DL_PER_MMOL_L, 1);
}

export function mmolLToMgDl(mmolPerL: number): number {
  return Math.round(mmolPerL * MG_DL_PER_MMOL_L);
}

export function kgToLb(kg: number): number {
  return round(kg * LB_PER_KG, 1);
}

export function lbToKg(lb: number): number {
  return round(lb / LB_PER_KG, 1);
}

export function celsiusToFahrenheit(celsius: number): number {
  return round((celsius * 9) / 5 + 32, 1);
}

/** Rounds to `digits` decimal places without floating-point leftovers (1.005 → 1.01). */
export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export type GlucoseUnit = 'mg/dL' | 'mmol/L';
export type WeightUnit = 'kg' | 'lb';

export function formatGlucose(mgPerDl: number, unit: GlucoseUnit = 'mg/dL'): string {
  return unit === 'mg/dL' ? `${Math.round(mgPerDl)} mg/dL` : `${mgDlToMmolL(mgPerDl).toFixed(1)} mmol/L`;
}

export function formatWeight(kg: number, unit: WeightUnit = 'kg'): string {
  return unit === 'kg' ? `${round(kg, 1).toFixed(1)} kg` : `${kgToLb(kg).toFixed(1)} lb`;
}

export function formatBloodPressure(systolic: number, diastolic: number): string {
  return `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`;
}

const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** 12345 → "$123.45"; negatives as "−$5.00" (credits). */
export function formatMoney(cents: number): string {
  const formatted = moneyFormat.format(Math.abs(cents) / 100);
  return cents < 0 ? `−${formatted}` : formatted;
}

/** "1.2 MB", "340 KB" — for attachment sizes. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${round(bytes / (1024 * 1024), 1)} MB`;
}
