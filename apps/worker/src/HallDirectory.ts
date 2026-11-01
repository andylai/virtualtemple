import { effectiveCounts, type HallReport } from '@temple/room-logic';
import { DurableObject } from 'cloudflare:workers';
import { configFor } from './config';

const MS_PER_SECOND = 1000;
/** A report is believed for this many heartbeat intervals before the hall is taken to be gone. */
const HEARTBEATS_BEFORE_STALE = 3;

/**
 * Keeps the latest people count of each hall so the Worker can answer "which hall has space"
 * without waking every hall. Counts are held in memory only: halls re-report on change and as a
 * heartbeat, so a restarted directory recovers by itself (spec section 5.5).
 */
export class HallDirectory extends DurableObject<Env> {
  private readonly reports = new Map<number, HallReport>();

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

  /**
   * The people in each hall that has reported recently. A hall whose
   * report is too old is left out, because an occupied hall keeps repeating its report.
   *
   * @param nowMs - The current time in epoch milliseconds.
   */
  counts(nowMs: number): { hall: number; count: number }[] {
    const staleAfterMs =
      configFor(this.env).hall.heartbeatSec * HEARTBEATS_BEFORE_STALE * MS_PER_SECOND;
    return [...effectiveCounts(this.reports, nowMs, staleAfterMs)].map(([hall, count]) => ({
      hall,
      count,
    }));
  }
}
