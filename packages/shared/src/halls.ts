import { FIRST_HALL_NUMBER } from './constants';

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
 * Reads the hall number back out of a hall's Durable Object name (see `hallRoomName`).
 *
 * @param name - A name such as `temple:flagship:3`.
 * @returns The hall number, or null when the name does not end in one.
 */
export function hallNumberFromRoomName(name: string): number | null {
  const last = name.split(':').at(-1) ?? '';
  return /^[0-9]{1,4}$/.test(last) ? Number(last) : null;
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
