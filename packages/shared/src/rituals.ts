import type { RitualId } from './manifest';

/** How the placeholder avatar should perform a ritual. Real animations replace these by name. */
export type RitualAnimation = 'greet' | 'bow' | 'lamp' | 'sit';

/** What a ritual is and how it behaves (spec section 3.4). Which rituals a temple offers is in its manifest. */
export interface RitualDefinition {
  id: RitualId;
  /** Keyboard keys that start it, as `KeyboardEvent.code` values. */
  keys: readonly string[];
  /** Whether the person needs a cushion; the server hands one out (FR-17). */
  needsSeat: boolean;
  /** Whether it is a button and has a key. Sitting for meditation is started from its own timer instead. */
  quick: boolean;
  /** How long it is performed, in milliseconds. */
  durationMs: number;
  animation: RitualAnimation;
}

const GREET_MS = 2500;
const BOW_MS = 6000;
const LAMP_MS = 1500;
/** The longest anyone may keep a cushion for meditation; the longest timer option is 15 minutes. */
const SIT_MAX_MS = 20 * 60 * 1000;

/** Every ritual the app knows. The key bindings come from the spec: 3, 1/E/Space, L. */
export const RITUALS: Readonly<Record<RitualId, RitualDefinition>> = {
  greet: {
    id: 'greet',
    keys: ['Digit3'],
    needsSeat: false,
    quick: true,
    durationMs: GREET_MS,
    animation: 'greet',
  },
  bow: {
    id: 'bow',
    keys: ['Digit1', 'KeyE', 'Space'],
    needsSeat: true,
    quick: true,
    durationMs: BOW_MS,
    animation: 'bow',
  },
  lamp: {
    id: 'lamp',
    keys: ['KeyL'],
    needsSeat: false,
    quick: true,
    durationMs: LAMP_MS,
    animation: 'lamp',
  },
  sit: {
    id: 'sit',
    keys: [],
    needsSeat: true,
    quick: false,
    durationMs: SIT_MAX_MS,
    animation: 'sit',
  },
};

/**
 * Finds the ritual that a key starts, among the rituals a temple offers.
 *
 * @param code - `KeyboardEvent.code`.
 * @param offered - The ritual ids in the temple's manifest.
 */
export function ritualForKey(code: string, offered: readonly RitualId[]): RitualId | null {
  return offered.find((id) => RITUALS[id].keys.includes(code)) ?? null;
}
