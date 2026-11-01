import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PreferencesStore,
  effectiveReduceMotion,
  loadPreferences,
  savePreferences,
  type StorageLike,
} from './preferences';

function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => void (data[key] = value),
    removeItem: (key) => void delete data[key],
  };
}

const brokenStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const KEY = 'temple.preferences';

describe('loadPreferences', () => {
  it('gives the defaults when nothing is stored, or when storage is blocked or missing', () => {
    expect(loadPreferences(memoryStorage())).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences(brokenStorage)).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it('reads back what was saved', () => {
    const storage = memoryStorage();
    const saved = {
      nickname: { adjectiveId: 'calm', nounId: 'lotus' },
      volumes: { ambient: 0.1, chanting: 0.2, sfx: 0.3 },
      backgroundPlay: true,
      reduceMotion: true,
      language: 'ms' as const,
    };
    savePreferences(storage, saved);
    expect(loadPreferences(storage)).toEqual(saved);
  });

  it.each(['not json', '42', 'null', '[]', '"text"'])(
    'falls back to the defaults for stored %s',
    (text) => {
      expect(loadPreferences(memoryStorage({ [KEY]: text }))).toEqual(DEFAULT_PREFERENCES);
    },
  );

  it('keeps the good fields and replaces only the bad ones', () => {
    const stored = JSON.stringify({
      nickname: 'Bob',
      volumes: { ambient: 5, chanting: 0.5, sfx: 'loud' },
      backgroundPlay: 'yes',
      reduceMotion: true,
      language: 'xx',
    });
    expect(loadPreferences(memoryStorage({ [KEY]: stored }))).toEqual({
      ...DEFAULT_PREFERENCES,
      volumes: {
        ambient: DEFAULT_PREFERENCES.volumes.ambient,
        chanting: 0.5,
        sfx: DEFAULT_PREFERENCES.volumes.sfx,
      },
      reduceMotion: true,
    });
  });

  it('refuses a nickname that is free text, not word ids', () => {
    const stored = JSON.stringify({ nickname: { adjectiveId: '<script>', nounId: 'lotus' } });
    expect(loadPreferences(memoryStorage({ [KEY]: stored })).nickname).toBeNull();
  });
});

describe('PreferencesStore', () => {
  it('saves every change and tells listeners', () => {
    const storage = memoryStorage();
    const store = new PreferencesStore(storage);
    let heard = 0;
    store.subscribe(() => (heard += 1));
    store.update({ backgroundPlay: true });
    store.update({ volumes: { ambient: 0, chanting: 0, sfx: 0 } });
    expect(heard).toBe(2);
    expect(loadPreferences(storage)).toMatchObject({
      backgroundPlay: true,
      volumes: { ambient: 0 },
    });
    expect(new PreferencesStore(storage).getState().backgroundPlay).toBe(true);
  });

  it('forgets everything, in memory and in storage', () => {
    const storage = memoryStorage();
    const store = new PreferencesStore(storage);
    store.update({ nickname: { adjectiveId: 'calm', nounId: 'lotus' } });
    store.forget();
    expect(store.getState()).toEqual(DEFAULT_PREFERENCES);
    expect(storage.data[KEY]).toBeUndefined();
  });

  it('still works when storage is blocked', () => {
    const store = new PreferencesStore(brokenStorage);
    store.update({ backgroundPlay: true });
    expect(store.getState().backgroundPlay).toBe(true);
    expect(() => store.forget()).not.toThrow();
  });
});

describe('effectiveReduceMotion', () => {
  it('follows the device unless the visitor chose', () => {
    expect(effectiveReduceMotion(DEFAULT_PREFERENCES, true)).toBe(true);
    expect(effectiveReduceMotion(DEFAULT_PREFERENCES, false)).toBe(false);
    expect(effectiveReduceMotion({ ...DEFAULT_PREFERENCES, reduceMotion: false }, true)).toBe(
      false,
    );
    expect(effectiveReduceMotion({ ...DEFAULT_PREFERENCES, reduceMotion: true }, false)).toBe(true);
  });
});
