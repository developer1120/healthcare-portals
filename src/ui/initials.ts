export type AvatarTone = 'coral' | 'glacier' | 'sage';

const toneOrder: AvatarTone[] = ['coral', 'glacier', 'sage'];

/** "Dr. Maya Okafor" → "MO". Titles and punctuation are ignored. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/\b(dr|mr|mrs|ms|mx|prof)\.?\s+/gi, '')
    .split(/[\s-]+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}

/** The same name always gets the same tone, so a person is recognisable across screens. */
export function toneFor(name: string): AvatarTone {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return toneOrder[hash % toneOrder.length]!;
}
