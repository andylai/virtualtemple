/** One communal chanting session, with times on the server's clock. */
export interface Session {
  startAtMs: number;
  durationMs: number;
}

/** What to do with the chanting recording right now. */
export type ChantPlan =
  | { state: 'waiting'; startInMs: number }
  | { state: 'playing'; offsetSec: number; endsInMs: number }
  | { state: 'ended' };

/**
 * Works out where everyone should be in the chanting (FR-28, FR-29, FR-42). Each browser plays its
 * own copy, started so that it is at the same place as everyone else's: the time since the session
 * began, on the server's clock. A browser that was late to download the recording, or joined in the
 * middle, simply starts further in. A recording shorter than the session repeats.
 *
 * @param session - The session, from the server.
 * @param serverNowMs - The time now, on the server's clock.
 * @param recordingSec - How long the recording is.
 */
export function planChant(session: Session, serverNowMs: number, recordingSec: number): ChantPlan {
  if (serverNowMs < session.startAtMs) {
    return { state: 'waiting', startInMs: session.startAtMs - serverNowMs };
  }
  const endAtMs = session.startAtMs + session.durationMs;
  if (serverNowMs >= endAtMs) {
    return { state: 'ended' };
  }
  const sinceStartSec = (serverNowMs - session.startAtMs) / 1000;
  return {
    state: 'playing',
    offsetSec: sinceStartSec % recordingSec,
    endsInMs: endAtMs - serverNowMs,
  };
}

/**
 * Estimates how far this browser's clock is behind the server's from the time the server put in
 * its welcome. Delay on the way is ignored; up to about 200 ms is acceptable (FR-30).
 *
 * @param serverTimeMs - The server's time in the welcome message.
 * @param localTimeMs - This browser's `Date.now()` when the welcome arrived.
 * @returns Milliseconds to add to the local time to get the server's time.
 */
export function clockOffset(serverTimeMs: number, localTimeMs: number): number {
  return serverTimeMs - localTimeMs;
}
