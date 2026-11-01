import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flagshipManifest as base } from './flagship';
import { ManifestError, parseManifest } from './manifest';

const MANIFEST_DIR = join(import.meta.dirname, '../../../manifests');

/** Returns the problems found in `raw`, joined into one string, or an empty string if valid. */
function problemsOf(raw: unknown): string {
  try {
    parseManifest(raw);
  } catch (error) {
    if (error instanceof ManifestError) {
      return error.issues.join(' | ');
    }
    throw error;
  }
  return '';
}

const hallWith = (change: Partial<typeof base.hall>) => ({ ...base.hall, ...change });

describe('every manifest file', () => {
  const files = readdirSync(MANIFEST_DIR).filter((file) => file.endsWith('.json'));
  it('finds at least the flagship manifest', () => {
    expect(files).toContain('flagship.json');
  });
  it.each(files)('%s is valid', (file) => {
    const raw: unknown = JSON.parse(readFileSync(join(MANIFEST_DIR, file), 'utf8'));
    expect(() => parseManifest(raw)).not.toThrow();
  });
});

describe('parseManifest', () => {
  it('accepts the flagship manifest', () => {
    expect(base.slug).toBe('flagship');
    expect(base.hall.cushions).toHaveLength(12);
  });

  it('accepts a real special day and rejects an impossible date', () => {
    const day = (date: string) => ({ date, name: { en: 'Example' }, extraChanting: ['09:00'] });
    expect(problemsOf({ ...base, specialDays: [day('2027-05-20')] })).toBe('');
    expect(problemsOf({ ...base, specialDays: [day('2027-02-31')] })).toContain(
      'not a real calendar date',
    );
  });

  it.each([
    ['a slug with capitals', { slug: 'Flagship' }, 'lowercase'],
    ['a bad time', { chantingSchedule: ['25:00'] }, 'HH:MM'],
    ['no English name', { name: { ms: 'Kuil' } }, 'English'],
    ['an unknown ritual', { rituals: ['greet', 'dance'] }, 'rituals'],
    ['a repeated ritual', { rituals: ['greet', 'greet'] }, 'more than once'],
    ['languages without English', { languages: ['ms'] }, 'must include "en"'],
    [
      'an insecure donation link',
      { donation: { type: 'link', url: 'http://pay.example' } },
      'donation',
    ],
    [
      'an audio path that climbs out',
      { audio: { ...base.audio, ambient: '../secret' } },
      'relative path',
    ],
    [
      'an absolute audio path',
      { audio: { ...base.audio, sfx: { ...base.audio.sfx, bell: '/etc/passwd' } } },
      'relative path',
    ],
  ])('rejects %s', (_label, change, expected) => {
    expect(problemsOf({ ...base, ...change })).toContain(expected);
  });

  it('rejects a cushion outside the walkable area', () => {
    const [first, ...rest] = base.hall.cushions;
    const moved = [{ ...first!, x: 50 }, ...rest];
    expect(problemsOf({ ...base, hall: hallWith({ cushions: moved }) })).toContain(
      'outside the walkable area',
    );
  });

  it('rejects duplicate cushion ids', () => {
    const [first, second, ...rest] = base.hall.cushions;
    const repeated = [first!, { ...second!, id: first!.id }, ...rest];
    expect(problemsOf({ ...base, hall: hallWith({ cushions: repeated }) })).toContain(
      'appears more than once',
    );
  });

  it('requires seats for bow and slots for lamp', () => {
    expect(problemsOf({ ...base, hall: hallWith({ cushions: [] }) })).toContain(
      '"bow" needs at least one cushion',
    );
    expect(problemsOf({ ...base, hall: hallWith({ lampSlots: [] }) })).toContain(
      '"lamp" needs at least one lamp slot',
    );
  });
});
