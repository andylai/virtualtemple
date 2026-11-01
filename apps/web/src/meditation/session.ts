const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;
/** After asking for a cushion, the visitor has this long to be seen walking or sitting, or the request is dropped. */
export const REQUEST_GRACE_MS = 3000;

/** A meditation timer (FR-34): asked for, then running once the visitor is on a cushion. */
export interface MeditationSession {
  durationMs: number;
  requestedAtMs: number;
  /** When the visitor sat down and the clock began, or null while they are still walking there. */
  startedAtMs: number | null;
}

/** What the hall shows about the visitor, as far as the timer cares. */
export interface Observation {
  /** Sitting on a cushion for meditation. */
  seated: boolean;
  /** Walking to a cushion. */
  walking: boolean;
  /** The hall said there was no cushion. */
  refused: boolean;
}

/** Makes a timer of the given number of minutes, not yet started. */
export function requestSession(minutes: number, nowMs: number): MeditationSession {
  return { durationMs: minutes * MS_PER_MINUTE, requestedAtMs: nowMs, startedAtMs: null };
}

/**
 * Moves the timer on by one look at the visitor. It runs from the moment they are seated, and
 * ends when the time is up or they stop sitting (stood up, walked away, or were removed). Time is
 * measured with timestamps, so a tab that was in the background still ends on time.
 *
 * @param session - The timer as it was.
 * @param observation - What the visitor is doing now.
 * @param nowMs - The time now, in epoch milliseconds.
 * @returns The timer as it is now (the same object when nothing changed, null when it is over), and
 *   whether it ended because the time was up.
 */
export function stepMeditation(
  session: MeditationSession,
  observation: Observation,
  nowMs: number,
): { session: MeditationSession | null; finished: boolean } {
  if (observation.refused) {
    return { session: null, finished: false };
  }
  if (session.startedAtMs === null) {
    if (observation.seated) {
      return { session: { ...session, startedAtMs: nowMs }, finished: false };
    }
    const gaveUp = !observation.walking && nowMs - session.requestedAtMs > REQUEST_GRACE_MS;
    return { session: gaveUp ? null : session, finished: false };
  }
  if (!observation.seated) {
    return { session: null, finished: false };
  }
  if (nowMs - session.startedAtMs >= session.durationMs) {
    return { session: null, finished: true };
  }
  return { session, finished: false };
}

/** How much of the time is left; all of it until the visitor has sat down. */
export function remainingMs(session: MeditationSession, nowMs: number): number {
  if (session.startedAtMs === null) {
    return session.durationMs;
  }
  return Math.max(0, session.durationMs - (nowMs - session.startedAtMs));
}

/** Writes a number of milliseconds as minutes and seconds, such as `04:07`, rounding up so it never shows 00:00 early. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
