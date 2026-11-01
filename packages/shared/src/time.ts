/** A calendar date and a clock time as people on the wall clock of a place read them. */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/**
 * Reads the wall clock of a place at an instant.
 *
 * @param atMs - The instant, in epoch milliseconds.
 * @param timeZone - An IANA name such as `Asia/Kuala_Lumpur`.
 */
export function zonedParts(atMs: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(atMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** How far the place's wall clock is ahead of UTC at an instant, in milliseconds (positive east of London). */
export function zoneOffsetMs(atMs: number, timeZone: string): number {
  const p = zonedParts(atMs, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(atMs / MS_PER_SECOND) * MS_PER_SECOND;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The date on the wall clock of a place at an instant, as `YYYY-MM-DD`. */
export function localDate(atMs: number, timeZone: string): string {
  const p = zonedParts(atMs, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The date a number of days before or after another, as `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/**
 * Turns a wall-clock time at a place into an instant. Where the clocks change, a time that does not
 * exist or happens twice is placed on one side of the change.
 *
 * @param date - `YYYY-MM-DD` on that place's calendar.
 * @param time - `HH:MM`, 24-hour.
 * @param timeZone - An IANA name such as `Asia/Kuala_Lumpur`.
 * @returns The instant, in epoch milliseconds.
 */
export function localTimeToUtcMs(date: string, time: string, timeZone: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  const second = wallAsUtc - zoneOffsetMs(first, timeZone);
  return second;
}
