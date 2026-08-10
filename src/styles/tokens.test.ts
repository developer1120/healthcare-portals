import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cssVarName, palettes, tokenNames } from '@/theme/palette';

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Pulls `--name: value;` pairs out of the rule with exactly this selector. */
function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector}" rule in tokens.css`);
  const body = css.slice(start, css.indexOf('}', start));
  return new Map([...body.matchAll(/(--mw-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

describe('tokens.css', () => {
  it.each([
    ['light', ':root'],
    ['dark', ":root[data-theme='dark']"],
  ] as const)('matches the %s palette in palette.ts', (theme, selector) => {
    const declared = declarations(selector);
    const expected = new Map(tokenNames.map((token) => [cssVarName(token), palettes[theme][token]]));
    expect(declared).toEqual(expected);
  });
});
