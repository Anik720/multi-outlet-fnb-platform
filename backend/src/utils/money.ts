/**
 * Money is stored as NUMERIC(12,2). Prisma returns it as a Decimal object (or a
 * string from raw queries). All arithmetic is done in integer cents to avoid
 * floating-point drift; the API exposes amounts as numbers with 2 decimals.
 */
type Numeric = string | number | { toString(): string };

export const toCents = (value: Numeric): number => Math.round(Number(value.toString()) * 100);

export const fromCents = (cents: number): number => cents / 100;

/** Formats cents as a NUMERIC-compatible string, e.g. 1250 -> "12.50". */
export const centsToDecimalString = (cents: number): string => (cents / 100).toFixed(2);

/** Normalises a DB numeric to a JS number with 2 decimals. */
export function money(value: Numeric): number;
export function money(value: Numeric | null): number | null;
export function money(value: Numeric | null): number | null {
  return value === null ? null : fromCents(toCents(value));
}
