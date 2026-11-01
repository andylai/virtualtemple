import { describe, expect, it } from 'vitest';
import { directoryName, hallNumberFromRoomName, hallRoomName, parseHallNumber } from './halls';

describe('parseHallNumber', () => {
  it('accepts whole numbers inside the range', () => {
    expect(parseHallNumber('1', 20)).toBe(1);
    expect(parseHallNumber('20', 20)).toBe(20);
  });

  it.each([null, '', '0', '21', '-1', '1.5', 'abc', '1e3', ' 2', '2 ', '00001', '99999'])(
    'rejects %j',
    (raw) => {
      expect(parseHallNumber(raw, 20)).toBeNull();
    },
  );
});

describe('names', () => {
  it('builds hall and directory names', () => {
    expect(hallRoomName('flagship', 3)).toBe('temple:flagship:3');
    expect(directoryName('flagship')).toBe('temple:flagship:directory');
  });
});

describe('hallNumberFromRoomName', () => {
  it('reads the number a hall name ends with', () => {
    expect(hallNumberFromRoomName(hallRoomName('flagship', 12))).toBe(12);
  });

  it.each(['temple:flagship:directory', 'temple:flagship:', '', 'x:y:1e3', 'temple:a:12345'])(
    'returns null for %j',
    (name) => {
      expect(hallNumberFromRoomName(name)).toBeNull();
    },
  );
});
