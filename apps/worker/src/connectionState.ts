import { CLOSE_CODE, type PlayerView } from '@temple/shared';
import type { Player } from '@temple/room-logic';

/** Storage key prefix for people who dropped and may come back. */
export const GRACE_PREFIX = 'grace:';
/** Storage key for the lamps that are lit. */
export const LAMPS_KEY = 'lamps';

/** A connection that has not joined yet. */
export interface PendingState {
  phase: 'pending';
  connectedAtMs: number;
  correlationId: string;
}

/** A connection whose person is in the hall. */
export interface AdmittedState {
  phase: 'admitted';
  player: Player;
  resumeToken: string;
  correlationId: string;
}

/** Per-connection state. It lives in the WebSocket attachment, so it survives hibernation. */
export type ConnectionState = PendingState | AdmittedState;

/** A person who dropped, kept in storage until they come back or the grace period ends. */
export interface GraceRecord {
  player: Player;
  expiresAtMs: number;
}

/** Closes the hall itself starts. People who leave this way are not kept for a reconnect. */
export const SERVER_CLOSE_CODES: ReadonlySet<number> = new Set([
  CLOSE_CODE.hallFull,
  CLOSE_CODE.invalidMessages,
  CLOSE_CODE.idle,
  CLOSE_CODE.joinTimeout,
  CLOSE_CODE.replaced,
]);

/** What others may see of a person: their look, place, and the ritual they are performing. */
export function toView(player: Player): PlayerView {
  const { id, nickname, avatarId, x, z, facing, ritual } = player;
  const performing = ritual?.phase === 'performing';
  return {
    id,
    nickname,
    avatarId,
    x,
    z,
    facing,
    ritual:
      performing && ritual !== null
        ? {
            ritualId: ritual.ritualId,
            ...(ritual.slotId === undefined ? {} : { slotId: ritual.slotId }),
          }
        : null,
  };
}

/** A token that lets a dropped person come back as themselves. It is secret: never log it. */
export function newResumeToken(): string {
  return crypto.randomUUID().replaceAll('-', '');
}
