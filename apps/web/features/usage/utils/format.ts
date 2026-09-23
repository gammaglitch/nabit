/**
 * Money as this page needs it: a single call often costs a fraction of a cent,
 * so two decimals would round most of the ledger to "$0.00" and hide the very
 * thing the page is for. Anything under a cent gets four decimals instead.
 *
 * Null means the provider never priced the call, which is not the same as free.
 */
export function formatUsd(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "$0";
  // A single Jev decision runs to millionths of a dollar. Four decimals would
  // round it to "$0.0000", which reads as free rather than as small.
  if (Math.abs(value) < 0.0001) return "<$0.0001";
  const decimals = Math.abs(value) < 0.01 ? 4 : 2;
  return `$${value.toFixed(decimals)}`;
}
