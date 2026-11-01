import { directoryName } from '@temple/shared';

/**
 * Reads the people count of each hall from the hall directory.
 *
 * @param env - The Worker environment.
 * @param nowMs - The current time in epoch milliseconds.
 * @returns A map of hall number to people. A hall that is not in the map has nobody in it.
 * @throws When the directory cannot be reached; callers decide how to carry on without it.
 */
export async function readHallCounts(env: Env, nowMs: number): Promise<Map<number, number>> {
  const directory = env.HallDirectory.getByName(directoryName(env.TEMPLE_SLUG));
  const entries = await directory.counts(nowMs);
  return new Map(entries.map((entry) => [entry.hall, entry.count]));
}
