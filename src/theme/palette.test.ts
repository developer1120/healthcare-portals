import { contrastRatio, relativeLuminance } from './contrast';
import { cssVarName, palettes, tokenNames } from './palette';
import type { TokenName } from './palette';

describe('contrast helpers', () => {
  it('gives the textbook extremes', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio('#183A2F', '#EEF3EE')).toBeCloseTo(contrastRatio('#EEF3EE', '#183A2F'));
  });

  it('rejects colours that are not #RRGGBB', () => {
    expect(() => relativeLuminance('teal')).toThrow(/#RRGGBB/);
    expect(() => relativeLuminance('#FFF')).toThrow(/#RRGGBB/);
  });
});

describe('cssVarName', () => {
  it('kebab-cases the token behind the mw prefix', () => {
    expect(cssVarName('ink')).toBe('--mw-ink');
    expect(cssVarName('inkMuted')).toBe('--mw-ink-muted');
    expect(cssVarName('surfaceSunken')).toBe('--mw-surface-sunken');
  });
});

/** Text pairs must meet WCAG AA for body text (4.5:1). */
const textPairs: [TokenName, TokenName][] = [
  ['ink', 'canvas'],
  ['ink', 'surface'],
  ['inkMuted', 'canvas'],
  ['inkMuted', 'surface'],
  ['inkMuted', 'surfaceSunken'],
  ['onAccent', 'accent'],
  ['onAccent', 'accentHover'],
  ['accentInk', 'accentSoft'],
  ['dataInk', 'dataSoft'],
  ['okInk', 'okSoft'],
  ['warnInk', 'warnSoft'],
  ['criticalInk', 'criticalSoft'],
  ['critical', 'surface'],
  ['railInk', 'rail'],
  ['railInk', 'railActive'],
];

/** Status dots, chart lines, placeholder text and the focus ring need 3:1 against what they sit on. */
const graphicPairs: [TokenName, TokenName][] = [
  ['ok', 'surface'],
  ['warn', 'surface'],
  ['data', 'surface'],
  ['inkSubtle', 'surface'],
  ['focus', 'canvas'],
  ['focus', 'surface'],
];

describe.each(['light', 'dark'] as const)('%s palette', (theme) => {
  const palette = palettes[theme];

  it('defines every token as a #RRGGBB colour', () => {
    for (const token of tokenNames) expect(palette[token]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it.each(textPairs)('%s on %s meets 4.5:1', (fg, bg) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(graphicPairs)('%s on %s meets 3:1', (fg, bg) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3);
  });
});

/** Ink colours also sit directly on cards, e.g. "Saved" in green or an overdue date in red. */
const inkOnSurface: TokenName[] = ['okInk', 'warnInk', 'criticalInk', 'dataInk', 'accentInk'];

describe.each(['light', 'dark'] as const)('%s palette, text on surfaces', (theme) => {
  const palette = palettes[theme];

  it.each(inkOnSurface)('%s on surface meets 4.5:1', (ink) => {
    expect(contrastRatio(palette[ink], palette.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on the pine feature cards and rail meets 4.5:1', () => {
    expect(contrastRatio('#FFFFFF', palette.rail)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', palette.railActive)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps ink-subtle for graphics only: it is too light for text', () => {
    // Text uses ink-muted; tokens.a11y.test checks no component uses ink-subtle for text.
    expect(contrastRatio(palette.inkMuted, palette.surfaceSunken)).toBeGreaterThanOrEqual(4.5);
  });
});
