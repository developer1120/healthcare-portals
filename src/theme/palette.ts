/**
 * Mendwell colour tokens. This file is the source of truth: `src/styles/tokens.css`
 * declares the same values as CSS custom properties (a test keeps the two in sync),
 * and SVG charts read colours from here when they need a literal value.
 *
 * Coral is an accent fill only. Text on it is always pine (`onAccent`), never white.
 */
export const tokenNames = [
  'canvas',
  'surface',
  'surfaceSunken',
  'ink',
  'inkMuted',
  'inkSubtle',
  'line',
  'lineStrong',
  'rail',
  'railInk',
  'railActive',
  'accent',
  'accentHover',
  'onAccent',
  'accentSoft',
  'accentInk',
  'data',
  'dataSoft',
  'dataInk',
  'ok',
  'okSoft',
  'okInk',
  'warn',
  'warnSoft',
  'warnInk',
  'critical',
  'criticalSoft',
  'criticalInk',
  'focus',
] as const;

export type TokenName = (typeof tokenNames)[number];
export type Palette = Record<TokenName, string>;
export type ThemeName = 'light' | 'dark';

export const palettes: Record<ThemeName, Palette> = {
  light: {
    canvas: '#EEF3EE',
    surface: '#FFFFFF',
    surfaceSunken: '#E4ECE6',
    ink: '#183A2F',
    inkMuted: '#526B60',
    inkSubtle: '#71877D',
    line: '#DCE6DE',
    lineStrong: '#C3D3C8',
    rail: '#183A2F',
    railInk: '#A9C4B6',
    railActive: '#2A5444',
    accent: '#FF8A65',
    accentHover: '#F7764F',
    onAccent: '#183A2F',
    accentSoft: '#FFE3D9',
    accentInk: '#7A2E17',
    data: '#3D7EA6',
    dataSoft: '#DDEBF3',
    dataInk: '#1F4A63',
    ok: '#2F8F5B',
    okSoft: '#DDF0E3',
    okInk: '#1B5436',
    warn: '#B7860B',
    warnSoft: '#F8EDCC',
    warnInk: '#5E4405',
    critical: '#C0362C',
    criticalSoft: '#FBE4E1',
    criticalInk: '#7D1F18',
    focus: '#3D7EA6',
  },
  dark: {
    canvas: '#0D1A15',
    surface: '#15261F',
    surfaceSunken: '#10201A',
    ink: '#E3EEE7',
    inkMuted: '#9DB5A9',
    inkSubtle: '#7F988B',
    line: '#23382F',
    lineStrong: '#2F493D',
    rail: '#0A1511',
    railInk: '#7FA191',
    railActive: '#1A3229',
    accent: '#FF9A7A',
    accentHover: '#FFAD93',
    onAccent: '#1A0E09',
    accentSoft: '#3A2119',
    accentInk: '#FFC2AE',
    data: '#6FA8CC',
    dataSoft: '#1A3242',
    dataInk: '#B9D8EC',
    ok: '#4DB57D',
    okSoft: '#163527',
    okInk: '#A6E3C0',
    warn: '#E6B94A',
    warnSoft: '#3A2F12',
    warnInk: '#F5DB9A',
    critical: '#EF6B5F',
    criticalSoft: '#3A1A17',
    criticalInk: '#FFB8B0',
    focus: '#6FA8CC',
  },
};

/** CSS custom property name for a token, e.g. `inkMuted` → `--mw-ink-muted`. */
export function cssVarName(token: TokenName): string {
  return `--mw-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}
