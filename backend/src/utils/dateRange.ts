export interface ResolvedRange {
  /** Inclusive lower bound. */
  from: Date | null;
  /** Exclusive upper bound. */
  to: Date | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalises a user supplied `from`/`to` pair into a half-open [from, to)
 * interval. A date-only `to` (e.g. 2026-09-30) includes that whole day (UTC).
 */
export function resolveRange(from?: string, to?: string): ResolvedRange {
  let end: Date | null = to ? new Date(to) : null;
  if (end && to && DATE_ONLY.test(to)) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { from: from ? new Date(from) : null, to: end };
}
