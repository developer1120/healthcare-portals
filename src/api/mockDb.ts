import { createSeed } from '@/data/seed';
import type { SeedData } from '@/data/seed';
import type { IsoDate } from '@/domain/types';
import { toIsoDate } from '@/lib/dates';

export const DB_STORAGE_KEY = 'mendwell:db';
/** Bump when the shape of the data changes, so older saved copies are reseeded. */
export const DB_VERSION = 8;

interface StoredDb {
  version: number;
  /** Calendar day the seed was built for. A new day gets a fresh seed so dates stay current. */
  seededOn: IsoDate;
  data: SeedData;
}

let db: SeedData | null = null;

function freshDb(): SeedData {
  const data = createSeed(new Date());
  save(data);
  return data;
}

function load(): SeedData {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as StoredDb;
      if (stored.version === DB_VERSION && stored.seededOn === toIsoDate(new Date())) return stored.data;
    }
  } catch {
    // Unreadable or blocked storage: fall through to a fresh seed.
  }
  return freshDb();
}

function save(data: SeedData): void {
  try {
    const stored: StoredDb = { version: DB_VERSION, seededOn: toIsoDate(new Date()), data };
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private mode or a full quota: changes still live in memory for this session.
  }
}

/**
 * The pretend server's data. Changes are saved to localStorage so bookings and
 * messages survive a reload, until the next calendar day reseeds it.
 */
export function getDb(): SeedData {
  db ??= load();
  return db;
}

/** Applies a change to the database and persists it. */
export function writeDb<T>(change: (data: SeedData) => T): T {
  const data = getDb();
  const result = change(data);
  save(data);
  return result;
}

/** Forgets all changes. Used by tests and by "reset demo data". */
export function resetMockServer(): void {
  db = null;
  try {
    localStorage.removeItem(DB_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
