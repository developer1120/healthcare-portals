export interface Page<T> {
  items: T[];
  /** 1-based, clamped to the pages that exist. */
  page: number;
  pageCount: number;
  /** 1-based positions of the first and last item shown; 0 when empty. */
  from: number;
  to: number;
  total: number;
}

/** One page of a list. Out-of-range or nonsense page numbers land on the nearest real page. */
export function paginate<T>(all: T[], requested: number, size: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(all.length / size));
  const page = Number.isFinite(requested) ? Math.min(Math.max(1, Math.trunc(requested)), pageCount) : 1;
  const start = (page - 1) * size;
  const items = all.slice(start, start + size);
  return {
    items,
    page,
    pageCount,
    from: items.length ? start + 1 : 0,
    to: start + items.length,
    total: all.length,
  };
}

/** Reads ?page= (or another key) from a URL, defaulting to 1. */
export function pageParam(params: URLSearchParams, key = 'page'): number {
  return Number(params.get(key) ?? '1') || 1;
}
