import { describe, expect, it } from 'vitest';
import { Tally, summarize } from './stats';

describe('summarize', () => {
  it('gives zeros for no values', () => {
    expect(summarize([])).toEqual({ count: 0, min: 0, mean: 0, p50: 0, p95: 0, max: 0 });
  });

  it('finds the middle and the high end', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(summarize(values)).toEqual({
      count: 100,
      min: 1,
      mean: 50.5,
      p50: 50,
      p95: 95,
      max: 100,
    });
  });

  it('does not change its input and handles one value', () => {
    const values = [3, 1, 2];
    summarize(values);
    expect(values).toEqual([3, 1, 2]);
    expect(summarize([7]).p95).toBe(7);
  });
});

describe('Tally', () => {
  it('counts, merges and lists by name', () => {
    const a = new Tally();
    a.add('x');
    a.add('x');
    const b = new Tally();
    b.add('y', 3);
    b.add('x');
    a.merge(b);
    expect(a.toObject()).toEqual({ x: 3, y: 3 });
  });
});
