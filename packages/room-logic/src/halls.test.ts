import { describe, expect, it } from 'vitest';
import { effectiveCounts, reportDelayMs, suggestHall, visibleHalls } from './halls';

const counts = (entries: [number, number][]) => new Map(entries);
const options = { hallCount: 20, maxPlayers: 50, spread: 1, random: () => 0 };

describe('effectiveCounts', () => {
  it('keeps fresh reports and drops stale ones', () => {
    const reports = new Map([
      [1, { count: 10, reportedAtMs: 9_000 }],
      [2, { count: 40, reportedAtMs: 1_000 }],
    ]);
    expect([...effectiveCounts(reports, 10_000, 5_000)]).toEqual([[1, 10]]);
  });

  it('counts a report exactly at the limit as fresh', () => {
    const reports = new Map([[3, { count: 7, reportedAtMs: 5_000 }]]);
    expect(effectiveCounts(reports, 10_000, 5_000).get(3)).toBe(7);
  });
});

describe('suggestHall', () => {
  it('picks the first hall with space when strictly fill-first', () => {
    expect(
      suggestHall(
        counts([
          [1, 50],
          [2, 50],
          [3, 12],
        ]),
        options,
      ),
    ).toBe(3);
    expect(suggestHall(new Map(), options)).toBe(1);
  });

  it('spreads the choice over the first few halls with space', () => {
    const state = counts([[1, 50]]);
    const pick = (value: number) =>
      suggestHall(state, { ...options, spread: 3, random: () => value });
    expect([pick(0), pick(0.4), pick(0.99)]).toEqual([2, 3, 4]);
  });

  it('never suggests an excluded hall', () => {
    expect(suggestHall(new Map(), { ...options, exclude: new Set([1]) })).toBe(2);
  });

  it('returns null when every hall is full', () => {
    const full = new Map(
      Array.from({ length: 3 }, (_, index) => [index + 1, 50] as [number, number]),
    );
    expect(suggestHall(full, { ...options, hallCount: 3 })).toBeNull();
  });

  it('never goes past the number of halls', () => {
    expect(
      suggestHall(counts([[1, 50]]), { ...options, hallCount: 2, spread: 5, random: () => 0.99 }),
    ).toBe(2);
  });
});

describe('visibleHalls', () => {
  it('lists halls with people plus the first empty hall', () => {
    const state = counts([
      [1, 50],
      [3, 4],
    ]);
    expect(visibleHalls(state, 20, 50)).toEqual([
      { hall: 1, count: 50, full: true },
      { hall: 2, count: 0, full: false },
      { hall: 3, count: 4, full: false },
    ]);
  });

  it('offers just hall 1 when nobody is anywhere', () => {
    expect(visibleHalls(new Map(), 20, 50)).toEqual([{ hall: 1, count: 0, full: false }]);
  });

  it('offers no empty hall when every hall has people', () => {
    expect(
      visibleHalls(
        counts([
          [1, 1],
          [2, 2],
        ]),
        2,
        50,
      ),
    ).toHaveLength(2);
  });
});

describe('reportDelayMs', () => {
  it('reports at once the first time and after the interval', () => {
    expect(reportDelayMs(null, 1_000, 3_000)).toBe(0);
    expect(reportDelayMs(1_000, 4_000, 3_000)).toBe(0);
  });

  it('waits for the rest of the interval otherwise', () => {
    expect(reportDelayMs(1_000, 2_000, 3_000)).toBe(2_000);
    expect(reportDelayMs(5_000, 1_000, 3_000)).toBe(7_000);
  });
});
