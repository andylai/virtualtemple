import { describe, expect, it } from 'vitest';
import { ChantingSchedule } from './chanting';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DURATION = 5 * MINUTE;
const LEAD = 2 * MINUTE;
/** 2026-11-02 05:00 and 18:00 in Malaysia, as instants. */
const MORNING = Date.UTC(2026, 10, 1, 21, 0);
const EVENING = Date.UTC(2026, 10, 2, 10, 0);

const schedule = (
  specialDays: ConstructorParameters<typeof ChantingSchedule>[0]['specialDays'] = [],
) =>
  new ChantingSchedule({
    timeZone: 'Asia/Kuala_Lumpur',
    regularTimes: ['05:00', '18:00'],
    specialDays,
    durationMs: DURATION,
    leadMs: LEAD,
  });

describe('current', () => {
  it('knows nothing between sessions', () => {
    expect(schedule().current(MORNING - HOUR)).toBeNull();
    expect(schedule().current(MORNING + DURATION)).toBeNull();
  });

  it('announces a session once it is within the lead time, and keeps it until it ends', () => {
    const session = { startAtMs: MORNING, durationMs: DURATION };
    expect(schedule().current(MORNING - LEAD - 1)).toBeNull();
    expect(schedule().current(MORNING - LEAD)).toEqual(session);
    expect(schedule().current(MORNING)).toEqual(session);
    expect(schedule().current(MORNING + DURATION - 1)).toEqual(session);
  });

  it('finds the evening session on the same day', () => {
    expect(schedule().current(EVENING + MINUTE)).toEqual({
      startAtMs: EVENING,
      durationMs: DURATION,
    });
  });

  it('finds tomorrow morning when it is late at night', () => {
    const nextMorning = MORNING + 24 * HOUR;
    expect(schedule().current(nextMorning - MINUTE)?.startAtMs).toBe(nextMorning);
  });
});

describe('special days', () => {
  const day = {
    date: '2026-11-02',
    name: { en: 'Example day', zh: '示例日' },
    extraChanting: ['09:00', '12:30'],
  };

  it('adds the extra times of the day, and only that day', () => {
    const starts = schedule([day])
      .sessionsAround(MORNING + HOUR)
      .map((s) => s.startAtMs);
    expect(starts).toContain(Date.UTC(2026, 10, 2, 1, 0));
    expect(starts).toContain(Date.UTC(2026, 10, 2, 4, 30));
    const otherDay = schedule([day]).sessionsAround(MORNING + 25 * HOUR);
    expect(otherDay.some((s) => s.startAtMs === Date.UTC(2026, 10, 3, 1, 0))).toBe(false);
  });

  it('announces an extra session like a regular one', () => {
    expect(schedule([day]).current(Date.UTC(2026, 10, 2, 0, 59))?.startAtMs).toBe(
      Date.UTC(2026, 10, 2, 1, 0),
    );
  });

  it("reports today's special day by the temple's calendar, not UTC", () => {
    const justAfterMidnightInMalaysia = Date.UTC(2026, 10, 1, 16, 5);
    expect(schedule([day]).specialDay(justAfterMidnightInMalaysia)).toEqual({
      date: '2026-11-02',
      name: day.name,
    });
    expect(schedule([day]).specialDay(Date.UTC(2026, 10, 1, 15, 55))).toBeNull();
    expect(schedule().specialDay(MORNING)).toBeNull();
  });

  it('counts the same time once when a special day repeats a regular time', () => {
    const repeated = { ...day, extraChanting: ['05:00'] };
    const mornings = schedule([repeated])
      .sessionsAround(MORNING)
      .filter((s) => s.startAtMs === MORNING);
    expect(mornings).toHaveLength(1);
  });
});

describe('nextChangeAtMs', () => {
  it('is the next announcement or end', () => {
    expect(schedule().nextChangeAtMs(MORNING - HOUR)).toBe(MORNING - LEAD);
    expect(schedule().nextChangeAtMs(MORNING - LEAD)).toBe(MORNING + DURATION);
    expect(schedule().nextChangeAtMs(MORNING + DURATION)).toBe(EVENING - LEAD);
  });
});
