import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { CATALOGS, pickLanguage, translate } from './translate';

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
    expect(translate('ms', 'enter.button')).toBe('Enter');
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
