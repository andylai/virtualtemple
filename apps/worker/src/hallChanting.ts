import type { ChantingSession, ServerMessage, SpecialDay } from '@temple/shared';
import type { ChantingSchedule } from '@temple/room-logic';

interface HallChantingDeps {
  schedule: ChantingSchedule;
  /** Which recording the session plays, as named in the manifest's audio section. */
  audioId: string;
  /** Sends to everyone in the hall. */
  broadcast: (message: ServerMessage) => void;
}

/**
 * Tells the hall about communal chanting (spec 3.7). A session is announced as soon as it is within
 * the preload lead time, with its absolute start time, so every browser can download the recording
 * and then start it at the same moment on its own clock. Nothing is remembered between wake-ups:
 * the schedule is worked out from the time, and announcing a session twice does no harm.
 */
export class HallChanting {
  private announcedStartAtMs: number | null = null;

  constructor(private readonly deps: HallChantingDeps) {}

  /** The session people should know about now, for the welcome message. */
  current(nowMs: number): ChantingSession | undefined {
    const session = this.deps.schedule.current(nowMs);
    return session === null ? undefined : { ...session, audioId: this.deps.audioId };
  }

  /** Today's special day, for the welcome message. */
  specialDay(nowMs: number): SpecialDay | undefined {
    return this.deps.schedule.specialDay(nowMs) ?? undefined;
  }

  /** Tells everyone when a session has just become current or has just ended. */
  update(nowMs: number): void {
    const session = this.current(nowMs);
    if (session !== undefined && session.startAtMs !== this.announcedStartAtMs) {
      this.announcedStartAtMs = session.startAtMs;
      this.deps.broadcast({ type: 'chanting_start', ...session });
    } else if (session === undefined && this.announcedStartAtMs !== null) {
      this.announcedStartAtMs = null;
      this.deps.broadcast({ type: 'chanting_end' });
    }
  }
}
