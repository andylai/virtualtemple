import { describe, expect, it } from 'vitest';
import { STRESS_MAX, readDebugFlags } from './queryFlags';

describe('readDebugFlags', () => {
  it('defaults to everything off', () => {
    expect(readDebugFlags('')).toEqual({ debug: false, stress: 0 });
  });

  it('reads debug and stress', () => {
    expect(readDebugFlags('?debug=1&stress=50')).toEqual({ debug: true, stress: 50 });
  });

  it('caps stress and ignores bad values', () => {
    expect(readDebugFlags('?stress=99999').stress).toBe(STRESS_MAX);
    expect(readDebugFlags('?stress=-5').stress).toBe(0);
    expect(readDebugFlags('?stress=abc').stress).toBe(0);
    expect(readDebugFlags('?debug=true').debug).toBe(false);
  });
});
