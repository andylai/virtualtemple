import { describe, expect, it } from 'vitest';
import { DueQueue } from './dueQueue';

describe('DueQueue', () => {
  it('knows nothing is due when empty', () => {
    const queue = new DueQueue();
    expect(queue.nextAtMs()).toBeNull();
    expect(queue.popDue(1_000)).toEqual([]);
  });

  it('reports the earliest time and releases keys in time order', () => {
    const queue = new DueQueue();
    queue.schedule('late', 300);
    queue.schedule('early', 100);
    queue.schedule('middle', 200);
    expect(queue.nextAtMs()).toBe(100);
    expect(queue.popDue(250)).toEqual(['early', 'middle']);
    expect(queue.nextAtMs()).toBe(300);
    expect(queue.popDue(1_000)).toEqual(['late']);
  });

  it('releases a key exactly at its time and only once', () => {
    const queue = new DueQueue();
    queue.schedule('a', 100);
    expect(queue.popDue(99)).toEqual([]);
    expect(queue.popDue(100)).toEqual(['a']);
    expect(queue.popDue(100)).toEqual([]);
  });

  it('replaces the time of a key that is scheduled again, and can cancel it', () => {
    const queue = new DueQueue();
    queue.schedule('a', 100);
    queue.schedule('a', 500);
    expect(queue.popDue(200)).toEqual([]);
    expect(queue.has('a')).toBe(true);
    queue.cancel('a');
    expect(queue.has('a')).toBe(false);
    expect(queue.nextAtMs()).toBeNull();
  });

  it('breaks a tie by key, so the order never depends on insertion', () => {
    const queue = new DueQueue();
    queue.schedule('b', 100);
    queue.schedule('a', 100);
    expect(queue.popDue(100)).toEqual(['a', 'b']);
  });
});
