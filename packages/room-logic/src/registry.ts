import {
  AVATAR_VARIANT_COUNT,
  boundsOf,
  isPointInPolygon,
  randomPointInPolygon,
  type NicknameIds,
  type PlayerView,
  type Point,
} from '@temple/shared';
import { hasSpace } from './capacity';
import { nicknameKey, pickNickname, type NicknameWords } from './nickname';

/** How deep the entrance strip is, in metres, where new visitors appear. */
const SPAWN_DEPTH = 2;
/** Keeps a new visitor off the very edge of the walkable area, in metres. */
const SPAWN_MARGIN = 0.5;

/** A person in the hall. */
export interface Player extends PlayerView {
  joinedAtMs: number;
}

/** Everything the registry needs to know about the hall. */
export interface RegistryOptions {
  maxPlayers: number;
  walkableArea: readonly Point[];
  nicknames: NicknameWords;
  random: () => number;
  /** Makes a new unique player id. */
  newPlayerId: () => string;
}

export type AdmitResult = { ok: true; player: Player } | { ok: false; reason: 'hall_full' };
export type MoveResult = 'ok' | 'unknown_player' | 'outside_area';

/**
 * Who is in one hall, and where. This is plain data and rules with no Cloudflare calls, so it
 * can be tested without a running server (ADR-003).
 *
 * Admission is one synchronous step: the capacity check and the adding of the person happen
 * together, so two people arriving at once can never take the last place.
 */
export class PlayerRegistry {
  private readonly players = new Map<string, Player>();
  private readonly moved = new Map<string, Player>();

  constructor(private readonly options: RegistryOptions) {}

  /** How many people are in the hall. */
  get size(): number {
    return this.players.size;
  }

  /** Everyone in the hall. */
  list(): Player[] {
    return [...this.players.values()];
  }

  /** Looks a person up by id. */
  get(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  /**
   * Admits a new visitor if there is space.
   *
   * @param requested - The nickname the browser remembered, if any.
   * @param nowMs - The current time in milliseconds.
   */
  admit(requested: NicknameIds | undefined, nowMs: number): AdmitResult {
    if (!hasSpace(this.players.size, this.options.maxPlayers)) {
      return { ok: false, reason: 'hall_full' };
    }
    const spawn = this.spawnPoint();
    const player: Player = {
      id: this.options.newPlayerId(),
      nickname: this.chooseNickname(requested),
      avatarId: Math.floor(this.options.random() * AVATAR_VARIANT_COUNT),
      x: spawn.x,
      z: spawn.z,
      facing: 0,
      joinedAtMs: nowMs,
    };
    this.players.set(player.id, player);
    return { ok: true, player };
  }

  /**
   * Puts back a person who reconnected, keeping their id, place and avatar. The nickname is kept
   * unless someone else took it while they were away.
   */
  readmit(previous: Player): AdmitResult {
    if (this.players.has(previous.id)) {
      return { ok: true, player: this.players.get(previous.id) as Player };
    }
    if (!hasSpace(this.players.size, this.options.maxPlayers)) {
      return { ok: false, reason: 'hall_full' };
    }
    const player = { ...previous, nickname: this.chooseNickname(previous.nickname) };
    this.players.set(player.id, player);
    return { ok: true, player };
  }

  /** Rebuilds the registry from saved people, for example after the server woke from hibernation. */
  restore(saved: Iterable<Player>): void {
    for (const player of saved) {
      this.players.set(player.id, player);
    }
  }

  /** Removes a person from the hall. Returns them, or undefined if they were not there. */
  remove(playerId: string): Player | undefined {
    const player = this.players.get(playerId);
    this.players.delete(playerId);
    this.moved.delete(playerId);
    return player;
  }

  /**
   * Moves a person. The position must be inside the walkable area.
   *
   * @param facing - Degrees; it is brought into the range 0 up to 360.
   */
  applyMove(playerId: string, x: number, z: number, facing: number): MoveResult {
    const player = this.players.get(playerId);
    if (player === undefined) {
      return 'unknown_player';
    }
    if (!isPointInPolygon({ x, z }, this.options.walkableArea)) {
      return 'outside_area';
    }
    player.x = x;
    player.z = z;
    player.facing = ((facing % 360) + 360) % 360;
    this.moved.set(playerId, player);
    return 'ok';
  }

  /** Whether anyone has moved since the last call to `drainMoved`. */
  get hasMoves(): boolean {
    return this.moved.size > 0;
  }

  /** Returns the people who moved since the last call and forgets them. */
  drainMoved(): Player[] {
    const moved = [...this.moved.values()];
    this.moved.clear();
    return moved;
  }

  private chooseNickname(requested: NicknameIds | undefined): NicknameIds {
    const taken = new Set(this.list().map((player) => nicknameKey(player.nickname)));
    return pickNickname(
      this.options.nicknames,
      requested,
      (key) => taken.has(key),
      this.options.random,
    );
  }

  private spawnPoint(): Point {
    const area = this.options.walkableArea;
    const bounds = boundsOf(area);
    const entrance = { ...bounds, minZ: bounds.maxZ - SPAWN_DEPTH };
    const point =
      randomPointInPolygon(area, this.options.random, SPAWN_MARGIN, entrance) ??
      randomPointInPolygon(area, this.options.random, SPAWN_MARGIN);
    if (point === null) {
      throw new Error('The walkable area is too small to place a visitor');
    }
    return point;
  }
}
