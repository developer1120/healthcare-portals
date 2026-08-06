/** Sparkline coordinate space; the SVG stretches it to fit its box. */
export const SPARK_WIDTH = 100;
export const SPARK_HEIGHT = 32;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Maps a value onto the y axis, flipping so larger values sit higher. A flat range sits mid-height. */
export function scaleY(value: number, min: number, max: number, height = SPARK_HEIGHT): number {
  if (max === min) return height / 2;
  return height - ((value - min) / (max - min)) * height;
}

/** SVG polyline points spreading values evenly across the width. One value draws a flat line. */
export function linePoints(values: number[], min: number, max: number): string {
  if (values.length === 1) {
    const y = round(scaleY(values[0]!, min, max));
    return `0,${y} ${SPARK_WIDTH},${y}`;
  }
  const step = SPARK_WIDTH / (values.length - 1);
  return values.map((value, i) => `${round(i * step)},${round(scaleY(value, min, max))}`).join(' ');
}

/** Maps a value from a domain onto a range linearly; a zero-width domain maps to the range's middle. */
export function linearScale([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  return (value: number): number => {
    if (d1 === d0) return (r0 + r1) / 2;
    return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
  };
}

/**
 * Round tick values covering [min, max], about `count` of them, on steps of
 * 1, 2, 2.5 or 5 times a power of ten (e.g. 4, 5, 6 or 100, 125, 150).
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return niceTicks(min - pad, max + pad, count);
  }
  const rough = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * power >= rough) ?? 10) * power;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(round(value));
  return ticks;
}
