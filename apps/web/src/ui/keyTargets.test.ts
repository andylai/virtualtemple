import { describe, expect, it } from 'vitest';
import { keyIsForControl } from './keyTargets';

/** A stand-in element that is inside the given kinds of element. */
function insideOf(...selectors: string[]): EventTarget {
  return {
    closest: (query: string) =>
      selectors.some((selector) => query.split(',').some((part) => part.trim() === selector))
        ? {}
        : null,
  } as unknown as EventTarget;
}

describe('keyIsForControl', () => {
  it('leaves keys alone when focus is on the page itself', () => {
    expect(keyIsForControl(null, 'Space')).toBe(false);
    expect(keyIsForControl(insideOf(), 'KeyW')).toBe(false);
  });

  it('keeps every key inside a dialog or a form field for that control', () => {
    expect(keyIsForControl(insideOf('[role="dialog"]'), 'ArrowLeft')).toBe(true);
    expect(keyIsForControl(insideOf('input'), 'KeyL')).toBe(true);
    expect(keyIsForControl(insideOf('select'), 'ArrowDown')).toBe(true);
  });

  it('lets Space and Enter press a focused button, but not other keys start something else', () => {
    expect(keyIsForControl(insideOf('button'), 'Space')).toBe(true);
    expect(keyIsForControl(insideOf('button'), 'Enter')).toBe(true);
    expect(keyIsForControl(insideOf('button'), 'KeyL')).toBe(false);
    expect(keyIsForControl(insideOf('button'), 'ArrowUp')).toBe(false);
  });
});
