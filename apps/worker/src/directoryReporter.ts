import { directoryName, ERROR_CODE, type TempleConfig } from '@temple/shared';
import { reportDelayMs, suggestHall } from '@temple/room-logic';
import { readHallCounts } from './directoryClient';
import type { Telemetry } from './telemetry';

const MS_PER_SECOND = 1000;

interface ReporterDeps {
  env: Env;
  hall: number;
  config: TempleConfig;
  /** How many people are in the hall right now. */
  population: () => number;
  waitUntil: (work: Promise<unknown>) => void;
  telemetry: Telemetry;
}

/**
 * Keeps the hall directory told how many people are in this hall (spec 5.5): at most one report per
 * `hall.reportIntervalSec` with a trailing report, at once when the hall is full, and a heartbeat
 * while it is occupied. It also asks the directory where a refused visitor should go next.
 */
export class DirectoryReporter {
  private lastReportAtMs: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ReporterDeps) {}

  /** The number of people changed. */
  populationChanged(): void {
    if (this.deps.population() >= this.deps.config.hall.maxPlayers) {
      // A full hall is told at once, so the next visitor is not sent to it.
      this.send();
    } else {
      this.schedule();
    }
  }

  /** An occupied hall repeats its report so the directory can tell a quiet hall from a gone one. */
  heartbeat(nowMs: number): void {
    const heartbeatMs = this.deps.config.hall.heartbeatSec * MS_PER_SECOND;
    const due = this.lastReportAtMs === null || nowMs - this.lastReportAtMs >= heartbeatMs;
    if (this.deps.population() > 0 && due) {
      this.send();
    }
  }

  /** Reports now and waits for the answer, for the moment a visitor is refused. */
  async reportNow(): Promise<void> {
    this.lastReportAtMs = Date.now();
    await this.report(this.deps.population());
  }

  /** The next hall to try, null when every hall is full, undefined when the directory is down. */
  async findNextHall(): Promise<number | null | undefined> {
    const { count, maxPlayers, suggestSpread } = this.deps.config.hall;
    try {
      const counts = await readHallCounts(this.deps.env, Date.now());
      counts.set(this.deps.hall, maxPlayers);
      return suggestHall(counts, {
        hallCount: count,
        maxPlayers,
        spread: suggestSpread,
        random: Math.random,
        exclude: new Set([this.deps.hall]),
      });
    } catch {
      this.deps.telemetry.count('directory_unavailable', { during: 'refusal' });
      return undefined;
    }
  }

  /** The error code to send with a refusal, for the answer of `findNextHall`. */
  static codeFor(nextHall: number | null | undefined): 'hall_full' | 'all_halls_full' {
    return nextHall === null ? ERROR_CODE.allHallsFull : ERROR_CODE.hallFull;
  }

  private schedule(): void {
    if (this.timer !== null) {
      return;
    }
    const intervalMs = this.deps.config.hall.reportIntervalSec * MS_PER_SECOND;
    const delay = reportDelayMs(this.lastReportAtMs, Date.now(), intervalMs);
    if (delay === 0) {
      this.send();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.send();
    }, delay);
  }

  private send(): void {
    this.lastReportAtMs = Date.now();
    this.deps.waitUntil(this.report(this.deps.population()));
  }

  private async report(count: number): Promise<void> {
    try {
      const directory = this.deps.env.HallDirectory.getByName(
        directoryName(this.deps.env.TEMPLE_SLUG),
      );
      await directory.report(this.deps.hall, count, Date.now());
    } catch {
      this.deps.telemetry.count('directory_unavailable', { during: 'report' });
    }
  }
}
