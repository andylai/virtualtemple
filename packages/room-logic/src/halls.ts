import { FIRST_HALL_NUMBER, type HallSummary } from '@temple/shared';

/** One hall's last report to the directory. */
export interface HallReport {
  count: number;
  reportedAtMs: number;
}

/** People per hall. A hall that is not in the map has nobody in it. */
export type HallCounts = ReadonlyMap<number, number>;

/**
 * Turns the directory's raw reports into counts. A report that has not been repeated within
 * `staleAfterMs` is dropped: an occupied hall repeats its report as a heartbeat, so silence means
 * the hall is gone, and it must not look occupied forever.
 *
 * @param reports - The latest report of each hall.
 * @param nowMs - The current time in milliseconds.
 * @param staleAfterMs - How long a report stays believable.
 */
export function effectiveCounts(
  reports: ReadonlyMap<number, HallReport>,
  nowMs: number,
  staleAfterMs: number,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const [hall, report] of reports) {
    if (nowMs - report.reportedAtMs <= staleAfterMs) {
      counts.set(hall, report.count);
    }
  }
  return counts;
}

/** Settings for choosing a hall. */
export interface SuggestOptions {
  hallCount: number;
  maxPlayers: number;
  /** The suggestion is picked at random among this many halls with space. 1 means strictly the first. */
  spread: number;
  random: () => number;
  /** Halls that must not be suggested, for example the hall that just refused someone. */
  exclude?: ReadonlySet<number>;
}

/**
 * Picks the hall a visitor should join. Halls fill in order, so the busiest halls stay lively
 * (spec FR-5), but the choice is spread over the first few halls with space so a burst of
 * visitors does not all choose the same one.
 *
 * @returns A hall number, or null when no hall has space.
 */
export function suggestHall(counts: HallCounts, options: SuggestOptions): number | null {
  const candidates: number[] = [];
  for (let hall = FIRST_HALL_NUMBER; hall <= options.hallCount; hall += 1) {
    const hasSpace = (counts.get(hall) ?? 0) < options.maxPlayers;
    if (hasSpace && options.exclude?.has(hall) !== true) {
      candidates.push(hall);
      if (candidates.length >= options.spread) {
        break;
      }
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  return candidates[Math.floor(options.random() * candidates.length)] as number;
}

/**
 * Lists the halls to show in "Change hall": every hall that has people, plus the first empty hall.
 * Empty halls cost nothing, so only one is offered, to keep the list short.
 */
export function visibleHalls(
  counts: HallCounts,
  hallCount: number,
  maxPlayers: number,
): HallSummary[] {
  const halls: HallSummary[] = [];
  let firstEmpty: number | null = null;
  for (let hall = FIRST_HALL_NUMBER; hall <= hallCount; hall += 1) {
    const count = counts.get(hall) ?? 0;
    if (count > 0) {
      halls.push({ hall, count, full: count >= maxPlayers });
    } else if (firstEmpty === null) {
      firstEmpty = hall;
    }
  }
  if (firstEmpty !== null) {
    halls.push({ hall: firstEmpty, count: 0, full: false });
  }
  return halls.sort((a, b) => a.hall - b.hall);
}

/**
 * How long to wait before reporting a count to the directory, so reports are at most one per
 * interval while the last change is never left unreported.
 *
 * @param lastReportAtMs - When the last report was made, or null if none was.
 * @param nowMs - The current time in milliseconds.
 * @param intervalMs - The minimum gap between reports.
 * @returns 0 when a report may go now, otherwise the wait in milliseconds.
 */
export function reportDelayMs(
  lastReportAtMs: number | null,
  nowMs: number,
  intervalMs: number,
): number {
  if (lastReportAtMs === null) {
    return 0;
  }
  return Math.max(0, lastReportAtMs + intervalMs - nowMs);
}
