import { parseHallsResponse, type HallsResponse } from '@temple/shared';

/** The list is needed to join, so a slow answer is given up on and the halls are tried in order. */
const HALLS_TIMEOUT_MS = 3000;

/**
 * Asks the Worker which halls exist and which one to join.
 *
 * @param fetchFn - `fetch`, passed in so tests can replace it.
 * @returns The list, or null when the Worker could not be reached or answered badly.
 */
export async function fetchHalls(
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = HALLS_TIMEOUT_MS,
): Promise<HallsResponse | null> {
  try {
    const response = await fetchFn('/api/halls', { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? parseHallsResponse(await response.json()) : null;
  } catch {
    return null;
  }
}
