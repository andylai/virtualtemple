import type { RitualId } from '@temple/shared';

/** When a person's ritual began, on this browser's clock, so its animation can be drawn from the start. */
export interface RitualRun {
  ritualId: RitualId;
  startedAtMs: number;
}

/** Who is performing which ritual, and since when. Read every frame, so it is not part of React state. */
export class RitualClock {
  private readonly runs = new Map<string, RitualRun>();

  start(playerId: string, ritualId: RitualId, startedAtMs: number): void {
    this.runs.set(playerId, { ritualId, startedAtMs });
  }

  stop(playerId: string): void {
    this.runs.delete(playerId);
  }

  get(playerId: string): RitualRun | undefined {
    return this.runs.get(playerId);
  }

  clear(): void {
    this.runs.clear();
  }
}
