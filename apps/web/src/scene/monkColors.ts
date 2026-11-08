/** The robe and sash colours for one placeholder monk variant. */
export interface MonkColors {
  robe: string;
  trim: string;
}

/** Warm tan used for the head, hands and feet of every variant; monks are told apart by robe, not skin. */
export const MONK_SKIN_COLOR = '#e6ba91';
/** Dark, unlit colour for the eyes and sandals. */
export const MONK_DARK_COLOR = '#2b1b12';

/**
 * One robe and sash colour pair per avatar variant, in the maroon, saffron and ochre tones of a
 * Tibetan monastic robe, so visitors can still be told apart (FR, spec 3.2) without the rainbow
 * hues of the earlier placeholder capsule.
 */
const MONK_PALETTE: readonly MonkColors[] = [
  { robe: '#7a2e3b', trim: '#c7a66b' },
  { robe: '#8c1f2b', trim: '#c7a66b' },
  { robe: '#b5551f', trim: '#7a2e3b' },
  { robe: '#e0a52b', trim: '#8c1f2b' },
  { robe: '#6e2338', trim: '#d98a2b' },
  { robe: '#a1472f', trim: '#c7a66b' },
];

/**
 * The robe colours for one avatar variant. Wraps around if a future variant count outgrows the
 * palette, so an out-of-range id still gets a valid pair instead of `undefined`.
 */
export function monkColors(avatarId: number): MonkColors {
  return MONK_PALETTE[avatarId % MONK_PALETTE.length]!;
}

/** Exported only for `monkColors.test.ts`, which checks it covers every avatar variant. */
export const MONK_PALETTE_SIZE = MONK_PALETTE.length;
