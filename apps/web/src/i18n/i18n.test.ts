import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import {
  CATALOGS,
  availableLanguages,
  pickLanguage,
  resolveLanguage,
  translate,
} from './translate';

const SRC_DIR = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('message keys', () => {
  it('defines every key that the source asks for', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(SRC_DIR)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) {
        used.add(match[1] as string);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((key) => !(key in en))).toEqual([]);
  });

  it('gives every language a complete catalog', () => {
    const keys = Object.keys(en).sort();
    for (const catalog of Object.values(CATALOGS)) {
      expect(Object.keys(catalog).sort()).toEqual(keys);
    }
  });
});

describe('translate', () => {
  it('fills markers and leaves unknown ones visible', () => {
    expect(translate('en', 'loading.progress', { percent: 42 })).toBe('Loading 42%');
    expect(translate('en', 'loading.progress')).toBe('Loading {percent}%');
  });

  it('falls back to English for a language without a catalog', () => {
    expect(translate('ms', 'enter.button', {}, { en })).toBe('Enter');
  });

  it('uses the language asked for when it has a catalog', () => {
    expect(translate('ms', 'enter.button')).toBe('Masuk');
    expect(translate('zh', 'enter.button')).toBe('进入');
  });
});

describe('every catalog', () => {
  const markers = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

  it('uses the same {markers} as English in every message, so no value is lost or left showing', () => {
    for (const [language, catalog] of Object.entries(CATALOGS)) {
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(markers(catalog[key]), `${language}: ${key}`).toEqual(markers(en[key]));
      }
    }
  });

  it('has no empty message', () => {
    for (const catalog of Object.values(CATALOGS)) {
      expect(Object.values(catalog).filter((text) => text.trim() === '')).toEqual([]);
    }
  });
});

describe('availableLanguages', () => {
  it('lists only languages that have a catalog and that the manifest offers', () => {
    expect(availableLanguages(['en'])).toEqual(['en']);
    expect(availableLanguages(['en', 'ms'])).toEqual(['en', 'ms']);
    expect(availableLanguages(['en', 'zh'], { en })).toEqual(['en']);
  });
});

describe('pickLanguage', () => {
  it('picks the first tag that has a catalog and otherwise English', () => {
    expect(pickLanguage(['ms-MY', 'en-GB'], ['en', 'ms'])).toBe('ms');
    expect(pickLanguage(['ms-MY', 'en-GB'], ['en'])).toBe('en');
    expect(pickLanguage(['fr-FR'], ['en'])).toBe('en');
    expect(pickLanguage([], ['en'])).toBe('en');
  });
});

it('uses the browser language until an offered language is chosen explicitly', () => {
  expect(resolveLanguage(null, ['zh-MY', 'en'])).toBe('zh');
  expect(resolveLanguage('en', ['zh-MY'])).toBe('en');
  expect(resolveLanguage('zh', ['en'])).toBe('zh');
  expect(resolveLanguage('ms', ['ms-MY', 'en'])).toBe('en');
});
