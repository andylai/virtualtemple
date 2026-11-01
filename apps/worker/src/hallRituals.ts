import type { RitualId, ServerMessage } from '@temple/shared';
import type { RitualEffect, RitualEngine, RitualError, RitualOutcome } from '@temple/room-logic';
import { LAMPS_KEY } from './connectionState';

interface HallRitualsDeps {
  engine: RitualEngine;
  storage: DurableObjectStorage;
  /** Sends to everyone in the hall. */
  broadcast: (message: ServerMessage) => void;
  /** Sends to one person only. */
  sendToPlayer: (playerId: string, message: ServerMessage) => void;
  /** Writes the people's current state into their connections, so it survives hibernation. */
  savePlayers: (playerIds: readonly string[]) => void;
  /** Asks for a movement snapshot, for when the server moved someone (onto a cushion). */
  scheduleSnapshot: () => void;
  waitUntil: (work: Promise<unknown>) => void;
}

/**
 * Connects the ritual rules to the platform: turns what the rules decided into messages, saves the
 * people whose ritual changed, and keeps the lit lamps in storage so they survive hibernation.
 */
export class HallRituals {
  constructor(private readonly deps: HallRitualsDeps) {}

  /** The lamps that are lit now, for the welcome message. */
  litLamps(): { slotId: string; ownerId: string }[] {
    return this.deps.engine.litLamps();
  }

  /** When the next ritual end or lamp expiry is due, or null. */
  nextDueAtMs(): number | null {
    return this.deps.engine.nextDueAtMs();
  }

  /** A person asks to start a ritual. Returns why it did not start, or null. */
  start(playerId: string, ritualId: RitualId, nowMs: number): RitualError | null {
    const outcome = this.deps.engine.start(playerId, ritualId, nowMs);
    this.apply(outcome);
    return outcome.error;
  }

  /** A person asks to stop. */
  stop(playerId: string): void {
    this.apply(this.deps.engine.stop(playerId));
  }

  /** A person has moved: they may have reached their cushion, or walked away from it. */
  moved(playerId: string, nowMs: number): void {
    this.apply(this.deps.engine.onMove(playerId, nowMs));
  }

  /** A person left the hall. Call before they are removed from the registry. */
  left(playerId: string): void {
    this.apply(this.deps.engine.onLeave(playerId));
  }

  /** Handles rituals that ended and lamps that went out. */
  runDue(nowMs: number): void {
    this.apply(this.deps.engine.runDue(nowMs));
  }

  private apply(outcome: RitualOutcome): void {
    outcome.effects.forEach((effect) => this.send(effect));
    if (outcome.changed.length > 0) {
      this.deps.savePlayers(outcome.changed);
    }
    if (
      outcome.effects.some((effect) => effect.type === 'lamp_lit' || effect.type === 'lamp_out')
    ) {
      this.deps.waitUntil(this.deps.storage.put(LAMPS_KEY, this.deps.engine.lampRecords()));
    }
    if (
      outcome.effects.some((effect) => effect.type === 'started' && effect.slotId !== undefined)
    ) {
      // Arriving at a cushion put the person exactly on it; everyone is told the new place.
      this.deps.scheduleSnapshot();
    }
  }

  private send(effect: RitualEffect): void {
    switch (effect.type) {
      case 'walk': {
        this.deps.sendToPlayer(effect.playerId, {
          type: 'ritual_walk',
          slotId: effect.slotId,
          x: effect.x,
          z: effect.z,
          facing: effect.facing,
        });
        break;
      }
      case 'started':
        this.deps.broadcast({
          type: 'ritual_started',
          playerId: effect.playerId,
          ritualId: effect.ritualId,
          ...(effect.slotId === undefined ? {} : { slotId: effect.slotId }),
        });
        break;
      case 'ended':
        this.deps.broadcast({ type: 'ritual_ended', playerId: effect.playerId });
        break;
      case 'lamp_lit':
        this.deps.broadcast({ type: 'lamp_lit', slotId: effect.slotId, ownerId: effect.ownerId });
        break;
      case 'lamp_out':
        this.deps.broadcast({ type: 'lamp_out', slotId: effect.slotId });
        break;
    }
  }
}
