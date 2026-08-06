import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * ink-subtle is below 4.5:1 for text in the light theme, so it's kept for
 * graphics (icons, chart lines) and disabled controls, which have no contrast
 * requirement. These are the places that use it, each for one of those reasons.
 */
const allowed = new Map([
  ['features/booking/SlotPicker.tsx', 'disabled time slots'],
  ['features/clinic/RosterPage.tsx', 'search field icon'],
]);

describe('colour use', () => {
  it('never uses ink-subtle for text', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('text-ink-subtle'))
      .map((file) => relative(SRC, file).replace(/\\/g, '/'))
      .filter((file) => !allowed.has(file));
    expect(offenders).toEqual([]);
  });
});
