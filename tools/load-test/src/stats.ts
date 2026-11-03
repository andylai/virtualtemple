/** A summary of a list of numbers, such as latencies in milliseconds. */
export interface Summary {
  count: number;
  min: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

const P50 = 0.5;
const P95 = 0.95;

/** The value below which a fraction `p` of the sorted values lie (nearest rank). */
function percentile(sorted: readonly number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? 0;
}

/** Summarises numbers. An empty list gives zeros, so a report never shows `NaN`. */
export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) {
    return { count: 0, min: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    min: sorted[0] ?? 0,
    mean: total / sorted.length,
    p50: percentile(sorted, P50),
    p95: percentile(sorted, P95),
    max: sorted.at(-1) ?? 0,
  };
}

/** Counts by name, for things such as close codes and refusal reasons. */
export class Tally {
  private readonly counts = new Map<string, number>();

  add(name: string, amount = 1): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + amount);
  }

  /** Adds another tally into this one. */
  merge(other: Tally): void {
    for (const [name, amount] of other.counts) {
      this.add(name, amount);
    }
  }

  toObject(): Record<string, number> {
    return Object.fromEntries([...this.counts].sort(([a], [b]) => a.localeCompare(b)));
  }
}
