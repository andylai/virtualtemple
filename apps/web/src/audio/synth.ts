/**
 * Placeholder sounds made from arithmetic, so the app has sound before real recordings exist.
 * Each function returns one channel of samples between -1 and 1. The real recordings replace them
 * through the manifest's audio paths; these are used whenever a file cannot be loaded.
 */

const TAU = 2 * Math.PI;
const PEAK = 0.8;

/** Scales a sound to its intended peak without changing the envelope. */
function normalise(samples: Float32Array<ArrayBuffer>, peak = PEAK): Float32Array<ArrayBuffer> {
  let loudest = 0;
  for (const sample of samples) {
    loudest = Math.max(loudest, Math.abs(sample));
  }
  const gain = loudest === 0 ? 1 : peak / loudest;
  return samples.map((sample) => sample * gain);
}

/** Keep the background below voices and ritual bells even for saved volume settings. */
const AMBIENT_PEAK = 0.16;
/** Open major voicings let a few gentle notes ring without a sustained drone. */
const AMBIENT_PHRASES = [
  [50, 57, 66, 64], // D major
  [43, 55, 59, 62], // G major
  [50, 57, 66, 69],
  [43, 55, 59, 57],
  [50, 54, 57, 64],
  [43, 55, 59, 62],
  [45, 57, 64, 61], // A major resolves back to D.
  [50, 57, 66, 62],
] as const;
const NOTE_OFFSETS = [0.04, 0.23, 0.42, 0.62] as const;
const NOTE_SPAN = 0.35;
const SOFT_ATTACK_SHARE = 0.055;
const MIDI_A = 69;
const A_HZ = 440;
const SEMITONES_PER_OCTAVE = 12;

/** Round off the strike and let the higher partials decay faster, like a softly played piano. */
function softPiano(phase: number, progress: number): number {
  const attack = Math.sin((Math.PI / 2) * Math.min(1, progress / SOFT_ATTACK_SHARE)) ** 2;
  const tail = (1 - progress) ** 2 * Math.exp(-2 * progress);
  const colour = Math.exp(-6 * progress);
  const overtones = 0.22 * Math.sin(2 * phase) + 0.075 * Math.sin(3.01 * phase);
  return attack * tail * (Math.sin(phase) + colour * overtones);
}

/** A quiet, original piano phrase with space between phrases and silence at the loop seam. */
export function synthAmbient(sampleRate: number, seconds: number): Float32Array<ArrayBuffer> {
  const length = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(length);
  const phraseLength = length / AMBIENT_PHRASES.length;
  const noteLength = Math.floor(phraseLength * NOTE_SPAN);
  AMBIENT_PHRASES.forEach((phrase, bar) => {
    phrase.forEach((pitch, note) => {
      const start = Math.floor((bar + NOTE_OFFSETS[note]!) * phraseLength);
      const frequency = A_HZ * 2 ** ((pitch - MIDI_A) / SEMITONES_PER_OCTAVE);
      const step = (TAU * frequency) / sampleRate;
      for (let i = 0; i < noteLength; i += 1) {
        const index = start + i;
        samples[index] = samples[index]! + softPiano(step * i, i / noteLength);
      }
    });
  });
  return normalise(samples, AMBIENT_PEAK);
}

/**
 * A low, steady chant-like hum: a voice with a few overtones, a second voice slightly out of tune
 * for a slow beating, a gentle vibrato, and a pulse every few seconds like phrases. Every
 * frequency fits a whole number of times into `seconds`, so it repeats seamlessly.
 *
 * @param sampleRate - Samples per second.
 * @param seconds - Length of the repeating part; use a multiple of 4.
 */
export function synthChant(sampleRate: number, seconds: number): Float32Array<ArrayBuffer> {
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  const base = 110;
  const overtones = [1, 0.6, 0.45, 0.3, 0.2];
  const detune = 0.5;
  const vibrato = { rate: 5.5, depth: 0.0006 };
  const pulseRate = 0.25;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const wobble = vibrato.depth * Math.sin(TAU * vibrato.rate * t);
    let sample = 0;
    overtones.forEach((weight, index) => {
      const frequency = base * (index + 1);
      sample += weight * Math.sin(TAU * frequency * (t + wobble));
      sample += weight * 0.8 * Math.sin(TAU * (frequency + detune * (index + 1)) * (t + wobble));
    });
    const pulse = 0.75 + 0.25 * Math.sin(TAU * pulseRate * t);
    out[i] = sample * pulse;
  }
  return normalise(out);
}

/** A struck temple bell: several partials, each fading at its own speed. */
export function synthBell(sampleRate: number, seconds = 4): Float32Array<ArrayBuffer> {
  const partials = [
    { ratio: 1, weight: 1, decay: 3 },
    { ratio: 2, weight: 0.6, decay: 2.2 },
    { ratio: 2.76, weight: 0.4, decay: 1.6 },
    { ratio: 5.4, weight: 0.25, decay: 1 },
  ];
  const base = 440;
  const attack = 0.005;
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const rise = Math.min(1, t / attack);
    let sample = 0;
    for (const { ratio, weight, decay } of partials) {
      sample += weight * Math.exp(-t / decay) * Math.sin(TAU * base * ratio * t);
    }
    out[i] = sample * rise;
  }
  return normalise(out);
}

/** A short high chime for a lamp being lit. */
export function synthLampChime(sampleRate: number, seconds = 1.6): Float32Array<ArrayBuffer> {
  const tones = [
    { frequency: 880, weight: 1, decay: 0.7 },
    { frequency: 1320, weight: 0.5, decay: 0.5 },
  ];
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    for (const { frequency, weight, decay } of tones) {
      sample += weight * Math.exp(-t / decay) * Math.sin(TAU * frequency * t);
    }
    out[i] = sample * Math.min(1, t / 0.004);
  }
  return normalise(out);
}
