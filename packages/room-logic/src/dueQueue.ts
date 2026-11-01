/**
 * Things that must happen at a given time, in order. The hall has only one alarm, so everything
 * that is due later (a ritual ending, a lamp going out, the idle sweep) waits here and the hall arms
 * its timer or alarm for the earliest one (ADR-009).
 */
export class DueQueue {
  private readonly due = new Map<string, number>();

  /** Schedules a key, replacing any earlier time for the same key. */
  schedule(key: string, atMs: number): void {
    this.due.set(key, atMs);
  }

  /** Forgets a key. */
  cancel(key: string): void {
    this.due.delete(key);
  }

  /** Whether a key is waiting. */
  has(key: string): boolean {
    return this.due.has(key);
  }

  /** The earliest time anything is due, or null when nothing waits. */
  nextAtMs(): number | null {
    let next: number | null = null;
    for (const atMs of this.due.values()) {
      next = next === null || atMs < next ? atMs : next;
    }
    return next;
  }

  /**
   * Removes and returns every key that is due, earliest first.
   *
   * @param nowMs - The current time in milliseconds.
   */
  popDue(nowMs: number): string[] {
    const ready = [...this.due.entries()]
      .filter(([, atMs]) => atMs <= nowMs)
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    ready.forEach(([key]) => this.due.delete(key));
    return ready.map(([key]) => key);
  }
}
