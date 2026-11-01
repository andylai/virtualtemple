import { addDays, localDate, localTimeToUtcMs, type LanguageCode } from '@temple/shared';

/** One communal chanting session. */
export interface ChantSession {
  startAtMs: number;
  durationMs: number;
}

/** A special day in the temple's calendar (spec 3.8). */
export interface SpecialDayEntry {
  date: string;
  name: Partial<Record<LanguageCode, string>>;
  /** Extra chanting times that day, `HH:MM`. */
  extraChanting: readonly string[];
}

/** What the schedule is built from; all of it comes from the temple's manifest. */
export interface ChantingOptions {
  /** The temple's time zone, for example `Asia/Kuala_Lumpur`. */
  timeZone: string;
  /** Chanting times every day, `HH:MM`. */
  regularTimes: readonly string[];
  specialDays: readonly SpecialDayEntry[];
  durationMs: number;
  /** How long before a session starts that people are told, so browsers can download the recording. */
  leadMs: number;
}

/**
 * When communal chanting happens (spec 3.7 and 3.8): the daily times plus the extra times of
 * special days, all on the temple's own clock. Everything is worked out from the time, so after the
 * hall was evicted from memory nothing needs to be remembered.
 */
export class ChantingSchedule {
  constructor(private readonly options: ChantingOptions) {}

  /** The sessions that start yesterday, today or tomorrow on the temple's calendar, earliest first. */
  sessionsAround(nowMs: number): ChantSession[] {
    const { timeZone, regularTimes, specialDays, durationMs } = this.options;
    const today = localDate(nowMs, timeZone);
    const starts = new Set<number>();
    for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
      const extra = specialDays
        .filter((day) => day.date === date)
        .flatMap((day) => day.extraChanting);
      for (const time of [...regularTimes, ...extra]) {
        starts.add(localTimeToUtcMs(date, time, timeZone));
      }
    }
    return [...starts].sort((a, b) => a - b).map((startAtMs) => ({ startAtMs, durationMs }));
  }

  /**
   * The session people should know about now: one that is on, or that starts within the lead time.
   * The earliest such session is returned.
   */
  current(nowMs: number): ChantSession | null {
    const { leadMs } = this.options;
    return (
      this.sessionsAround(nowMs).find(
        (session) =>
          session.startAtMs - leadMs <= nowMs && nowMs < session.startAtMs + session.durationMs,
      ) ?? null
    );
  }

  /** The next moment `current` changes: a session is announced or has ended. Null if none is known. */
  nextChangeAtMs(nowMs: number): number | null {
    const { leadMs } = this.options;
    const changes = this.sessionsAround(nowMs)
      .flatMap((session) => [session.startAtMs - leadMs, session.startAtMs + session.durationMs])
      .filter((atMs) => atMs > nowMs);
    return changes.length === 0 ? null : Math.min(...changes);
  }

  /** Today's special day on the temple's calendar, or null. */
  specialDay(nowMs: number): { date: string; name: SpecialDayEntry['name'] } | null {
    const today = localDate(nowMs, this.options.timeZone);
    const day = this.options.specialDays.find((entry) => entry.date === today);
    return day === undefined ? null : { date: day.date, name: day.name };
  }
}
