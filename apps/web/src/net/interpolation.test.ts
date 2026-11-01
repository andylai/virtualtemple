import { describe, expect, it } from 'vitest';
import { PositionTrack, TrackSet, lerpAngleDegrees, renderDelayMs } from './interpolation';

const at = (atMs: number, x: number, z = 0, facing = 0) => ({ atMs, x, z, facing });

describe('PositionTrack', () => {
  it('knows nothing until it has a position', () => {
    expect(new PositionTrack().sampleAt(100)).toBeNull();
  });

  it('blends between two positions', () => {
    const track = new PositionTrack();
    track.push(at(0, 0, 0));
    track.push(at(100, 10, 20));
    expect(track.sampleAt(50)).toMatchObject({ x: 5, z: 10 });
    expect(track.sampleAt(25)).toMatchObject({ x: 2.5, z: 5 });
  });

  it('holds the first position before it and the last after it, never guessing ahead', () => {
    const track = new PositionTrack();
    track.push(at(100, 1));
    track.push(at(200, 2));
    expect(track.sampleAt(0)?.x).toBe(1);
    expect(track.sampleAt(500)?.x).toBe(2);
  });

  it('ignores a position that is not newer than the last', () => {
    const track = new PositionTrack();
    track.push(at(100, 1));
    track.push(at(100, 99));
    track.push(at(50, 98));
    expect(track.sampleAt(100)?.x).toBe(1);
  });

  it('keeps only the recent positions', () => {
    const track = new PositionTrack();
    for (let i = 0; i < 50; i += 1) {
      track.push(at(i * 100, i));
    }
    expect(track.sampleAt(0)?.x).toBe(40);
    expect(track.sampleAt(4900)?.x).toBe(49);
  });
});

describe('lerpAngleDegrees', () => {
  it('turns the short way round', () => {
    expect(lerpAngleDegrees(350, 10, 0.5)).toBeCloseTo(0);
    expect(lerpAngleDegrees(10, 350, 0.5)).toBeCloseTo(0);
    expect(lerpAngleDegrees(0, 90, 0.5)).toBeCloseTo(45);
  });
});

describe('renderDelayMs', () => {
  it('is two snapshot intervals', () => {
    expect(renderDelayMs(8)).toBe(250);
    expect(renderDelayMs(10)).toBe(200);
  });
});

describe('TrackSet', () => {
  it('keeps a separate track for each person', () => {
    const set = new TrackSet();
    set.push('a', at(0, 1));
    set.push('b', at(0, 2));
    expect(set.get('a')?.sampleAt(0)?.x).toBe(1);
    set.remove('a');
    expect(set.get('a')).toBeUndefined();
    set.clear();
    expect(set.get('b')).toBeUndefined();
  });
});
