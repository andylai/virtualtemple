import { RITUALS, type RitualId } from '@temple/shared';
import { DueQueue } from './dueQueue';
import type { Player, PlayerRegistry } from './registry';

/** A person this close to their cushion has arrived and starts to bow, in metres. */
const ARRIVE_RADIUS_M = 0.6;
/** Someone who bows and then gets this far from their cushion has walked away, in metres. */
const LEAVE_RADIUS_M = 1.2;
const RITUAL_KEY = 'ritual:';
const LAMP_KEY = 'lamp:';

/** A cushion in the hall. */
export interface CushionSpot {
  id: string;
  x: number;
  z: number;
  /** Degrees; 0 faces the altar. */
  facing: number;
}

/** A place on the lamp rack. */
export interface LampSpot {
  id: string;
  x: number;
  z: number;
}

/** A lit lamp, kept so it survives the hall being evicted from memory. */
export interface LampRecord {
  slotId: string;
  ownerId: string;
  expiresAtMs: number;
}

/** Things the hall must tell people after a ritual change. */
export type RitualEffect =
  | { type: 'walk'; playerId: string; slotId: string; x: number; z: number; facing: number }
  | { type: 'started'; playerId: string; ritualId: RitualId; slotId?: string }
  | { type: 'ended'; playerId: string }
  | { type: 'lamp_lit'; slotId: string; ownerId: string }
  | { type: 'lamp_out'; slotId: string };

/** Why a ritual was not started. */
export type RitualError =
  'not_in_hall' | 'not_offered' | 'cooldown' | 'no_slot_free' | 'lamp_limit';

/** The result of a change: what to tell people, and whose saved ritual state changed. */
export interface RitualOutcome {
  error: RitualError | null;
  effects: RitualEffect[];
  /** People whose `ritual` changed, so the hall can save them. */
  changed: string[];
}

/** What the engine needs to know about the hall and the temple. */
export interface RitualEngineOptions {
  players: PlayerRegistry;
  /** Ritual ids the temple offers. */
  offered: readonly RitualId[];
  cushions: readonly CushionSpot[];
  lampSlots: readonly LampSpot[];
  cooldownMs: number;
  walkTimeoutMs: number;
  lampDurationMs: number;
  lampMaxPerPlayer: number;
}

type Plan = { error: RitualError } | { slot: CushionSpot | LampSpot | null };

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

/**
 * The rules of the rituals (spec 3.4): who may start one, which cushion or lamp place they are
 * given, when it ends, and what happens when they walk away or leave. It is plain code with no
 * Cloudflare calls (ADR-003). Every change returns the messages to send, so the rules can be
 * tested without a server. Cushions and lamp places are handed out in one synchronous step, so two
 * people can never be given the same one (FR-17).
 */
export class RitualEngine {
  private readonly queue = new DueQueue();
  private readonly cushionOwners = new Map<string, string>();
  private readonly lamps = new Map<string, LampRecord>();
  private readonly lastStartMs = new Map<string, number>();

  constructor(private readonly options: RitualEngineOptions) {}

  /** When the next ritual end or lamp expiry is due, or null. */
  nextDueAtMs(): number | null {
    return this.queue.nextAtMs();
  }

  /** The lamps that are lit now. */
  litLamps(): { slotId: string; ownerId: string }[] {
    return [...this.lamps.values()].map(({ slotId, ownerId }) => ({ slotId, ownerId }));
  }

  /** The lamps with their expiry, for saving. */
  lampRecords(): LampRecord[] {
    return [...this.lamps.values()];
  }

  /**
   * Rebuilds what is kept only in memory, after the hall was evicted: cushion owners and end times
   * from the people's saved ritual state, and the lamps from storage.
   */
  rebuild(lamps: readonly LampRecord[]): void {
    for (const player of this.options.players.list()) {
      if (player.ritual !== null) {
        if (player.ritual.slotId !== undefined) {
          this.cushionOwners.set(player.ritual.slotId, player.id);
        }
        this.queue.schedule(RITUAL_KEY + player.id, player.ritual.endsAtMs);
      }
    }
    for (const lamp of lamps) {
      this.lamps.set(lamp.slotId, lamp);
      this.queue.schedule(LAMP_KEY + lamp.slotId, lamp.expiresAtMs);
    }
  }

  /**
   * A person asks to start a ritual. A failed attempt changes nothing, so it does not cancel
   * what they are already doing. Starting a new ritual ends the old one.
   */
  start(playerId: string, ritualId: RitualId, nowMs: number): RitualOutcome {
    const player = this.options.players.get(playerId);
    if (player === undefined) {
      return this.failed('not_in_hall');
    }
    const refusal = this.refusal(playerId, ritualId, nowMs);
    const plan = refusal === null ? this.plan(player, ritualId) : { error: refusal };
    if ('error' in plan) {
      return this.failed(plan.error);
    }
    const outcome = this.empty();
    this.release(player, outcome, true);
    this.lastStartMs.set(playerId, nowMs);
    this.begin(player, ritualId, plan.slot, nowMs, outcome);
    return this.finish(outcome);
  }

  /** A person asks to stop what they are doing. */
  stop(playerId: string): RitualOutcome {
    const outcome = this.empty();
    const player = this.options.players.get(playerId);
    if (player !== undefined) {
      this.release(player, outcome, true);
    }
    return this.finish(outcome);
  }

  /** A person has just moved. Arriving at the cushion starts the bow or the sitting; walking away ends it. */
  onMove(playerId: string, nowMs: number): RitualOutcome {
    const outcome = this.empty();
    const player = this.options.players.get(playerId);
    const ritual = player?.ritual;
    const cushion = this.cushionOf(ritual?.slotId);
    if (
      player !== undefined &&
      ritual !== null &&
      ritual !== undefined &&
      RITUALS[ritual.ritualId].needsSeat &&
      cushion !== undefined
    ) {
      const away = distance(player, cushion);
      if (ritual.phase === 'walking' && away <= ARRIVE_RADIUS_M) {
        this.arrive(player, cushion, nowMs, outcome);
      } else if (ritual.phase === 'performing' && away > LEAVE_RADIUS_M) {
        this.release(player, outcome, true);
      }
    }
    return this.finish(outcome);
  }

  /** A person left the hall: their cushion is free again. Others learn it from `player_left`. */
  onLeave(playerId: string): RitualOutcome {
    const outcome = this.empty();
    const player = this.options.players.get(playerId);
    if (player !== undefined) {
      this.release(player, outcome, false);
    }
    this.lastStartMs.delete(playerId);
    return this.finish(outcome);
  }

  /** Handles everything that has come due: rituals that end, walks that time out, lamps that go out. */
  runDue(nowMs: number): RitualOutcome {
    const outcome = this.empty();
    for (const key of this.queue.popDue(nowMs)) {
      if (key.startsWith(RITUAL_KEY)) {
        const player = this.options.players.get(key.slice(RITUAL_KEY.length));
        if (player !== undefined) {
          this.release(player, outcome, true);
        }
      } else if (key.startsWith(LAMP_KEY)) {
        const slotId = key.slice(LAMP_KEY.length);
        if (this.lamps.delete(slotId)) {
          outcome.effects.push({ type: 'lamp_out', slotId });
        }
      }
    }
    return this.finish(outcome);
  }

  private refusal(playerId: string, ritualId: RitualId, nowMs: number): RitualError | null {
    if (!this.options.offered.includes(ritualId)) {
      return 'not_offered';
    }
    const last = this.lastStartMs.get(playerId);
    return last !== undefined && nowMs - last < this.options.cooldownMs ? 'cooldown' : null;
  }

  /** Works out what a ritual needs (a cushion or a lamp place) before anything is changed. */
  private plan(player: Player, ritualId: RitualId): Plan {
    if (RITUALS[ritualId].needsSeat) {
      const slot = this.nearestFreeCushion(player);
      return slot === null ? { error: 'no_slot_free' } : { slot };
    }
    if (ritualId === 'lamp') {
      const owned = [...this.lamps.values()].filter((lamp) => lamp.ownerId === player.id).length;
      if (owned >= this.options.lampMaxPerPlayer) {
        return { error: 'lamp_limit' };
      }
      const slot = this.options.lampSlots.find((spot) => !this.lamps.has(spot.id));
      return slot === undefined ? { error: 'no_slot_free' } : { slot };
    }
    return { slot: null };
  }

  private begin(
    player: Player,
    ritualId: RitualId,
    slot: CushionSpot | LampSpot | null,
    nowMs: number,
    outcome: RitualOutcome,
  ): void {
    if (RITUALS[ritualId].needsSeat && slot !== null && 'facing' in slot) {
      this.cushionOwners.set(slot.id, player.id);
      this.setRitual(
        player,
        {
          ritualId,
          phase: 'walking',
          slotId: slot.id,
          endsAtMs: nowMs + this.options.walkTimeoutMs,
        },
        outcome,
      );
      outcome.effects.push({
        type: 'walk',
        playerId: player.id,
        slotId: slot.id,
        x: slot.x,
        z: slot.z,
        facing: slot.facing,
      });
      if (distance(player, slot) <= ARRIVE_RADIUS_M) {
        this.arrive(player, slot, nowMs, outcome);
      }
      return;
    }
    this.setRitual(
      player,
      {
        ritualId,
        phase: 'performing',
        endsAtMs: nowMs + RITUALS[ritualId].durationMs,
      },
      outcome,
    );
    outcome.effects.push({ type: 'started', playerId: player.id, ritualId });
    if (ritualId === 'lamp' && slot !== null) {
      const expiresAtMs = nowMs + this.options.lampDurationMs;
      this.lamps.set(slot.id, { slotId: slot.id, ownerId: player.id, expiresAtMs });
      this.queue.schedule(LAMP_KEY + slot.id, expiresAtMs);
      outcome.effects.push({ type: 'lamp_lit', slotId: slot.id, ownerId: player.id });
    }
  }

  /** The person reached their cushion: they are put exactly on it and the bow begins. */
  private arrive(
    player: Player,
    cushion: CushionSpot,
    nowMs: number,
    outcome: RitualOutcome,
  ): void {
    const ritualId = player.ritual?.ritualId;
    if (ritualId === undefined) {
      return;
    }
    this.options.players.setPosition(player.id, cushion.x, cushion.z, cushion.facing);
    this.setRitual(
      player,
      {
        ritualId,
        phase: 'performing',
        slotId: cushion.id,
        endsAtMs: nowMs + RITUALS[ritualId].durationMs,
      },
      outcome,
    );
    outcome.effects.push({ type: 'started', playerId: player.id, ritualId, slotId: cushion.id });
  }

  /** Ends whatever the person is doing and frees their cushion. `announce` tells others it ended. */
  private release(player: Player, outcome: RitualOutcome, announce: boolean): void {
    const ritual = player.ritual;
    if (ritual === null) {
      return;
    }
    if (ritual.slotId !== undefined) {
      this.cushionOwners.delete(ritual.slotId);
    }
    this.queue.cancel(RITUAL_KEY + player.id);
    player.ritual = null;
    outcome.changed.push(player.id);
    if (announce && ritual.phase === 'performing') {
      outcome.effects.push({ type: 'ended', playerId: player.id });
    }
  }

  private setRitual(
    player: Player,
    ritual: NonNullable<Player['ritual']>,
    outcome: RitualOutcome,
  ): void {
    player.ritual = ritual;
    this.queue.schedule(RITUAL_KEY + player.id, ritual.endsAtMs);
    outcome.changed.push(player.id);
  }

  /** The free cushion closest to the person; a cushion they hold themselves counts as free. */
  private nearestFreeCushion(player: Player): CushionSpot | null {
    let best: CushionSpot | null = null;
    for (const cushion of this.options.cushions) {
      const owner = this.cushionOwners.get(cushion.id);
      if (
        (owner === undefined || owner === player.id) &&
        (best === null || this.closer(player, cushion, best))
      ) {
        best = cushion;
      }
    }
    return best;
  }

  private closer(player: Player, candidate: CushionSpot, best: CushionSpot): boolean {
    const difference = distance(player, candidate) - distance(player, best);
    return difference < 0 || (difference === 0 && candidate.id < best.id);
  }

  private cushionOf(slotId: string | undefined): CushionSpot | undefined {
    return this.options.cushions.find((cushion) => cushion.id === slotId);
  }

  private empty(): RitualOutcome {
    return { error: null, effects: [], changed: [] };
  }

  private failed(error: RitualError): RitualOutcome {
    return { error, effects: [], changed: [] };
  }

  private finish(outcome: RitualOutcome): RitualOutcome {
    return { ...outcome, changed: [...new Set(outcome.changed)] };
  }
}
