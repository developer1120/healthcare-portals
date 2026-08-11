type ClassValue = string | false | null | undefined;

/** Joins class names, skipping falsy entries: cx('a', isOn && 'b') → 'a b'. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
