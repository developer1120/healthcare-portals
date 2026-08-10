/**
 * jsdom has no matchMedia. This stand-in answers queries from a small set of flags
 * that tests can flip, and notifies listeners when a flag changes. The viewport
 * defaults to a wide desktop so layouts match what most tests expect.
 */
type Listener = (event: MediaQueryListEvent) => void;

const DEFAULT_WIDTH = 1440;
const flags = { dark: false, width: DEFAULT_WIDTH };
const lists = new Set<{ media: string; listeners: Set<Listener> }>();

/** Understands prefers-color-scheme and min-/max-width in px, joined with "and". */
function evaluate(media: string): boolean {
  if (media.includes('prefers-color-scheme: dark')) return flags.dark;
  const parts = [...media.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)];
  if (parts.length === 0) return false;
  return parts.every(([, bound, px]) => (bound === 'min' ? flags.width >= Number(px) : flags.width <= Number(px)));
}

function notify(): void {
  for (const entry of lists) {
    const event = { matches: evaluate(entry.media), media: entry.media } as MediaQueryListEvent;
    entry.listeners.forEach((listener) => listener(event));
  }
}

export function installMatchMedia(): void {
  window.matchMedia = (media: string): MediaQueryList => {
    const entry = { media, listeners: new Set<Listener>() };
    lists.add(entry);
    return {
      media,
      get matches() {
        return evaluate(media);
      },
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => entry.listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => entry.listeners.delete(listener),
      addListener: (listener: Listener) => entry.listeners.add(listener),
      removeListener: (listener: Listener) => entry.listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  };
}

/** Pretend the operating system switched to (or away from) dark mode. */
export function setSystemDarkMode(dark: boolean): void {
  flags.dark = dark;
  notify();
}

/** Pretend the window is this many CSS pixels wide, e.g. 375 for a phone. */
export function setViewportWidth(width: number): void {
  flags.width = width;
  notify();
}

export function resetMatchMedia(): void {
  flags.dark = false;
  flags.width = DEFAULT_WIDTH;
  lists.clear();
}
