/** Where a person was at one moment, as seen by this browser. */
export interface Sample {
  atMs: number;
  x: number;
  z: number;
  facing: number;
}

/** Positions kept per person; enough to bridge a few late or lost snapshots. */
const MAX_SAMPLES = 10;
/** Other people are drawn this many snapshot intervals in the past, so there is always a next point to move towards. */
const DELAY_INTERVALS = 2;
const MS_PER_SECOND = 1000;
const HALF_TURN = 180;
const FULL_TURN = 360;

/** How far behind real time other people are drawn, in milliseconds. */
export function renderDelayMs(positionSendHz: number): number {
  return (MS_PER_SECOND / positionSendHz) * DELAY_INTERVALS;
}

/** Blends two angles in degrees along the shorter way round. */
export function lerpAngleDegrees(from: number, to: number, t: number): number {
  const difference = ((((to - from) % FULL_TURN) + FULL_TURN + HALF_TURN) % FULL_TURN) - HALF_TURN;
  return (from + difference * t + FULL_TURN) % FULL_TURN;
}

/**
 * The recent positions of one person. Asking for a moment between two positions gives a point
 * between them, so slow network updates look like smooth walking (FR-15). It never guesses past
 * the newest position.
 */
export class PositionTrack {
  private samples: Sample[] = [];

  /** Adds a position. One that is not newer than the last is ignored. */
  push(sample: Sample): void {
    const last = this.samples.at(-1);
    if (last !== undefined && sample.atMs <= last.atMs) {
      return;
    }
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  /** Where the person was at `timeMs`, or null when nothing is known yet. */
  sampleAt(timeMs: number): Sample | null {
    const first = this.samples[0];
    const last = this.samples.at(-1);
    if (first === undefined || last === undefined) {
      return null;
    }
    if (timeMs <= first.atMs) {
      return first;
    }
    if (timeMs >= last.atMs) {
      return last;
    }
    const index = this.samples.findIndex((sample) => sample.atMs > timeMs);
    const before = this.samples[index - 1] as Sample;
    const after = this.samples[index] as Sample;
    const t = (timeMs - before.atMs) / (after.atMs - before.atMs);
    return {
      atMs: timeMs,
      x: before.x + (after.x - before.x) * t,
      z: before.z + (after.z - before.z) * t,
      facing: lerpAngleDegrees(before.facing, after.facing, t),
    };
  }
}

/** The tracks of everyone in the hall, by person id. */
export class TrackSet {
  private tracks = new Map<string, PositionTrack>();

  push(playerId: string, sample: Sample): void {
    let track = this.tracks.get(playerId);
    if (track === undefined) {
      track = new PositionTrack();
      this.tracks.set(playerId, track);
    }
    track.push(sample);
  }

  get(playerId: string): PositionTrack | undefined {
    return this.tracks.get(playerId);
  }

  remove(playerId: string): void {
    this.tracks.delete(playerId);
  }

  clear(): void {
    this.tracks.clear();
  }
}
