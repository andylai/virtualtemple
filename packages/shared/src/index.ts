/** Halls are numbered from 1 so the number matches the "Hall 1" label visitors see. */
export const FIRST_HALL_NUMBER = 1;

/** WebSocket close codes. The 4000-4999 range is reserved for applications. */
export const CLOSE_CODE = {
  hallFull: 4001,
} as const;

/** Server-to-client error codes (spec section 6.2). */
export const ERROR_CODE = {
  hallFull: 'hall_full',
} as const;

/**
 * Builds the Durable Object name of one hall.
 *
 * @param slug - The temple slug from the manifest.
 * @param hall - The hall number, starting at 1.
 */
export function hallRoomName(slug: string, hall: number): string {
  return `temple:${slug}:${hall}`;
}

/**
 * Builds the Durable Object name of a temple's hall directory.
 *
 * @param slug - The temple slug from the manifest.
 */
export function directoryName(slug: string): string {
  return `temple:${slug}:directory`;
}

/**
 * Reads a hall number from untrusted input such as a URL parameter.
 *
 * @param raw - The raw parameter value, or null when absent.
 * @param hallCount - How many halls the temple offers.
 * @returns A whole number from 1 to `hallCount`, or null when the input is anything else.
 */
export function parseHallNumber(raw: string | null, hallCount: number): number | null {
  if (raw === null || !/^[0-9]{1,4}$/.test(raw)) {
    return null;
  }
  const hall = Number(raw);
  return hall >= FIRST_HALL_NUMBER && hall <= hallCount ? hall : null;
}

export * from './config';
export * from './geometry';
export * from './manifest';
