import { describe, expect, it } from 'vitest';
import { addDays, localDate, localTimeToUtcMs, zoneOffsetMs, zonedParts } from './time';

const KL = 'Asia/Kuala_Lumpur';
const NEW_YORK = 'America/New_York';
const HOUR = 3_600_000;

describe('Malaysia time (UTC+8, no daylight saving)', () => {
  it('reads the wall clock', () => {
    expect(zonedParts(Date.UTC(2026, 10, 1, 21, 0, 30), KL)).toEqual({
      year: 2026,
      month: 11,
      day: 2,
      hour: 5,
      minute: 0,
      second: 30,
    });
  });

  it('is eight hours ahead all year', () => {
    expect(zoneOffsetMs(Date.UTC(2026, 0, 1), KL)).toBe(8 * HOUR);
    expect(zoneOffsetMs(Date.UTC(2026, 6, 1), KL)).toBe(8 * HOUR);
  });

  it('turns 05:00 and 18:00 on a date into instants', () => {
    expect(localTimeToUtcMs('2026-11-02', '05:00', KL)).toBe(Date.UTC(2026, 10, 1, 21, 0));
    expect(localTimeToUtcMs('2026-11-02', '18:00', KL)).toBe(Date.UTC(2026, 10, 2, 10, 0));
  });

  it('knows which calendar day it is, either side of local midnight', () => {
    expect(localDate(Date.UTC(2026, 10, 1, 15, 59, 59), KL)).toBe('2026-11-01');
    expect(localDate(Date.UTC(2026, 10, 1, 16, 0, 0), KL)).toBe('2026-11-02');
  });
});

describe('a place with daylight saving', () => {
  it('follows the clocks changing in New York', () => {
    expect(localTimeToUtcMs('2026-03-07', '12:00', NEW_YORK)).toBe(Date.UTC(2026, 2, 7, 17, 0));
    expect(localTimeToUtcMs('2026-03-08', '12:00', NEW_YORK)).toBe(Date.UTC(2026, 2, 8, 16, 0));
    expect(localTimeToUtcMs('2026-11-01', '12:00', NEW_YORK)).toBe(Date.UTC(2026, 10, 1, 17, 0));
  });
});

describe('addDays', () => {
  it('crosses months and years, forwards and backwards', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-11-01', 0)).toBe('2026-11-01');
  });
});
