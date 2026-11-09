// Percentiles for the probe's timings (openproduct-standalone OPN-2).
//
// Nearest-rank: p95 of 50 samples is the 48th smallest — a value that was
// actually observed, never an interpolation between two. The smoke script
// (`scripts/probe-run.mjs`) recomputes the same summary over the samples of
// several requests with the same rule.

export interface Summary {
  readonly n: number;
  readonly p50: number;
  readonly p95: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1]!;
}

export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    min: round(sorted[0]!),
    max: round(sorted[sorted.length - 1]!),
    mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  };
}
