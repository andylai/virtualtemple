import {
  DEFAULT_CONFIG,
  LANGUAGE_CODES,
  type LanguageCode,
  type NicknameIds,
} from '@temple/shared';
import { z } from 'zod';
import { Store } from '../net/store';

/** The three volume layers, each from 0 to 1. */
export interface Volumes {
  ambient: number;
  chanting: number;
  sfx: number;
}

/** What the browser remembers about a visitor between visits (FR-3). Nothing else is stored. */
export interface Preferences {
  /** The two word ids of the visitor's nickname, or null for a new one each time. */
  nickname: NicknameIds | null;
  volumes: Volumes;
  /** Whether sound keeps playing when the tab is in the background (FR-25). */
  backgroundPlay: boolean;
  /** `true` or `false` to choose, `null` to follow the device's own setting (FR-36). */
  reduceMotion: boolean | null;
  /** The language chosen by hand, or null to follow the browser's. */
  language: LanguageCode | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
  nickname: null,
  volumes: { ...DEFAULT_CONFIG.audio.defaultVolumes },
  backgroundPlay: false,
  reduceMotion: null,
  language: null,
};

const STORAGE_KEY = 'temple.preferences';

const itemId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const volume = (fallback: number) => z.number().min(0).max(1).catch(fallback);
const defaults = DEFAULT_PREFERENCES;

/**
 * What is read back from storage. Storage can hold anything (an old version, a hand edit, another
 * program), so each field is checked on its own and a bad one falls back to its default.
 */
const preferencesSchema = z
  .object({
    nickname: z.object({ adjectiveId: itemId, nounId: itemId }).nullable().catch(null),
    volumes: z
      .object({
        ambient: volume(defaults.volumes.ambient),
        chanting: volume(defaults.volumes.chanting),
        sfx: volume(defaults.volumes.sfx),
      })
      .catch(defaults.volumes),
    backgroundPlay: z.boolean().catch(defaults.backgroundPlay),
    reduceMotion: z.boolean().nullable().catch(null),
    language: z.enum(LANGUAGE_CODES).nullable().catch(null),
  })
  .catch(defaults);

/** The part of `Storage` that is used, so tests can replace it. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's `localStorage`, or null where it is blocked (private windows, blocked site data). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the remembered preferences, or the defaults when there are none or storage is unavailable.
 *
 * @param storage - Where they are kept, or null.
 */
export function loadPreferences(storage: StorageLike | null): Preferences {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text === null || text === undefined
      ? defaults
      : preferencesSchema.parse(JSON.parse(text));
  } catch {
    return defaults;
  }
}

/** Writes the preferences. A failure (full or blocked storage) is ignored: the page works without it. */
export function savePreferences(storage: StorageLike | null, preferences: Preferences): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Not being able to remember is not an error for the visitor.
  }
}

/** Forgets everything that was remembered. */
export function forgetPreferences(storage: StorageLike | null): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
}

/**
 * Whether to reduce motion: the visitor's own choice if they made one, otherwise the device's.
 *
 * @param preferences - The visitor's preferences.
 * @param deviceReducesMotion - The `prefers-reduced-motion` setting of the device.
 */
export function effectiveReduceMotion(
  preferences: Preferences,
  deviceReducesMotion: boolean,
): boolean {
  return preferences.reduceMotion ?? deviceReducesMotion;
}

/** A preferences store that saves every change. */
export class PreferencesStore extends Store<Preferences> {
  constructor(private readonly storage: StorageLike | null) {
    super(loadPreferences(storage));
  }

  /** Changes some preferences and remembers the result. */
  update(change: Partial<Preferences>): void {
    const next = { ...this.getState(), ...change };
    savePreferences(this.storage, next);
    this.setState(next);
  }

  /** Goes back to the defaults and removes what was stored. */
  forget(): void {
    forgetPreferences(this.storage);
    this.setState(defaults);
  }
}

let shared: PreferencesStore | null = null;

/** The one preferences store of the page, made on first use. */
export function preferencesStore(): PreferencesStore {
  shared ??= new PreferencesStore(browserStorage());
  return shared;
}
