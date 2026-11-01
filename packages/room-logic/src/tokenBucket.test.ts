import { describe, expect, it } from 'vitest';
import { TokenBucket } from './tokenBucket';

describe('TokenBucket', () => {
  it('allows a burst and then refuses', () => {
    const bucket = new TokenBucket(10, 3, 0);
    expect([0, 0, 0, 0].map((at) => bucket.tryTake(at))).toEqual([true, true, true, false]);
  });

  it('refills at the steady rate', () => {
    const bucket = new TokenBucket(10, 3, 0);
    for (let i = 0; i < 3; i += 1) {
      bucket.tryTake(0);
    }
    expect(bucket.tryTake(50)).toBe(false);
    expect(bucket.tryTake(100)).toBe(true);
    expect(bucket.tryTake(100)).toBe(false);
  });

  it('never holds more than the burst, however long it was idle', () => {
    const bucket = new TokenBucket(10, 2, 0);
    expect([60_000, 60_000, 60_000].map((at) => bucket.tryTake(at))).toEqual([true, true, false]);
  });

  it('ignores a clock that goes backwards', () => {
    const bucket = new TokenBucket(10, 1, 1000);
    expect(bucket.tryTake(1000)).toBe(true);
    expect(bucket.tryTake(500)).toBe(false);
  });
});
