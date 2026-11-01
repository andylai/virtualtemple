import { describe, expect, it } from 'vitest';
import { synthAmbient, synthBell, synthChant, synthLampChime } from './synth';

const RATE = 8000;

const rms = (samples: Float32Array, from: number, to: number): number => {
  let sum = 0;
  for (let i = from; i < to; i += 1) {
    sum += (samples[i] as number) ** 2;
  }
  return Math.sqrt(sum / (to - from));
};

describe.each([
  ['ambient', () => synthAmbient(RATE, 4)],
  ['chant', () => synthChant(RATE, 4)],
  ['bell', () => synthBell(RATE)],
  ['lamp chime', () => synthLampChime(RATE)],
])('%s', (_name, make) => {
  it('has samples that are real numbers between -1 and 1, and is not silent', () => {
    const samples = make();
    expect(samples.length).toBeGreaterThan(RATE);
    expect(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1)).toBe(true);
    expect(rms(samples, 0, samples.length)).toBeGreaterThan(0.01);
  });

  it('is the same every time', () => {
    expect(make()).toEqual(make());
  });
});

describe('lengths', () => {
  it('make the asked-for length of the repeating part', () => {
    expect(synthChant(RATE, 4).length).toBe(4 * RATE);
    expect(synthAmbient(RATE, 4).length).toBe(4 * RATE);
    expect(synthBell(RATE, 2).length).toBe(2 * RATE);
  });
});

/** The biggest change between two neighbouring samples inside the sound: what a smooth sound does. */
const biggestStep = (samples: Float32Array): number => {
  let biggest = 0;
  for (let i = 1; i < samples.length; i += 1) {
    biggest = Math.max(biggest, Math.abs((samples[i] as number) - (samples[i - 1] as number)));
  }
  return biggest;
};

describe('looping', () => {
  it.each([
    ['ambient', synthAmbient(RATE, 6)],
    ['chant', synthChant(RATE, 8)],
  ])(
    '%s goes from its last sample to its first as smoothly as the sound moves inside',
    (_name, samples) => {
      const jump = Math.abs((samples[0] as number) - (samples[samples.length - 1] as number));
      expect(jump).toBeLessThanOrEqual(biggestStep(samples) * 1.5);
    },
  );
});

describe('bell and chime', () => {
  it('start loud and fade away', () => {
    for (const samples of [synthBell(RATE), synthLampChime(RATE)]) {
      const early = rms(samples, 0, RATE / 10);
      const late = rms(samples, samples.length - RATE / 10, samples.length);
      expect(early).toBeGreaterThan(late * 3);
    }
  });
});
