import { describe, expect, it } from 'vitest';
import { hasSpace } from './capacity';

describe('hasSpace', () => {
  it('admits while below capacity', () => {
    expect(hasSpace(0, 50)).toBe(true);
    expect(hasSpace(49, 50)).toBe(true);
  });

  it('refuses at and above capacity', () => {
    expect(hasSpace(50, 50)).toBe(false);
    expect(hasSpace(51, 50)).toBe(false);
  });
});
