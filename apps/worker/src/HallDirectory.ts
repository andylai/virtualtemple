import { DurableObject } from 'cloudflare:workers';

/** The latest known people count of one hall. */
export interface HallCount {
  hall: number;
  count: number;
}

interface Report {
  count: number;
  reportedAtMs: number;
}

/**
 * Keeps the latest people count of each hall so the Worker can answer "which hall has space"
 * without waking every hall. Counts are held in memory only: halls re-report on change and as a
 * heartbeat, so a restarted directory recovers by itself (spec section 5.5).
 */
export class HallDirectory extends DurableObject<Env> {
  private readonly reports = new Map<number, Report>();

  /**
   * Records a hall's people count. A report older than the one already held is ignored, so
   * messages that arrive out of order cannot move a count backwards.
   *
   * @param hall - The hall number.
   * @param count - People in the hall.
   * @param reportedAtMs - When the hall made the report, in epoch milliseconds.
   */
  report(hall: number, count: number, reportedAtMs: number): void {
    const known = this.reports.get(hall);
    if (known !== undefined && known.reportedAtMs > reportedAtMs) {
      return;
    }
    this.reports.set(hall, { count, reportedAtMs });
  }

  /** Lists the known hall counts in hall order. */
  list(): HallCount[] {
    return [...this.reports.entries()]
      .map(([hall, { count }]) => ({ hall, count }))
      .sort((a, b) => a.hall - b.hall);
  }
}
