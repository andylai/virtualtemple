import { describe, expect, it } from 'vitest';
import { describeHall } from './hallLabels';

const hall = (n: number, count: number, full = false) => ({ hall: n, count, full });

describe('describeHall', () => {
  it('names the hall the visitor is in, even when it is full', () => {
    expect(describeHall(hall(2, 50, true), 2).key).toBe('hall.entry.here');
  });

  it('says full, empty, one person or many people', () => {
    expect(describeHall(hall(1, 50, true), 2).key).toBe('hall.entry.full');
    expect(describeHall(hall(3, 0), 2).key).toBe('hall.entry.empty');
    expect(describeHall(hall(4, 1), 2).key).toBe('hall.entry.one');
    expect(describeHall(hall(5, 18), 2)).toEqual({
      key: 'hall.entry.other',
      params: { n: 5, count: 18 },
    });
  });

  it('works before the visitor is in a hall', () => {
    expect(describeHall(hall(1, 3), null).key).toBe('hall.entry.other');
  });
});
