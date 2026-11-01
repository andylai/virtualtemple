import { z } from 'zod';
import { isPointInPolygon, type Point } from './geometry';

/** Ritual ids the app knows how to perform (spec section 3.4). */
export const RITUAL_IDS = ['greet', 'bow', 'beads', 'lamp'] as const;
/** Languages the interface can be translated into. English is the first and always present. */
export const LANGUAGE_CODES = ['en', 'ms', 'zh'] as const;
/** Buddhist traditions a temple can declare. `undecided` is the placeholder until open question O-2. */
export const TRADITIONS = ['undecided', 'theravada', 'mahayana'] as const;
/** Hall templates the scene can draw. `blockout` is the box-shaped placeholder. */
export const HALL_TEMPLATES = ['blockout'] as const;

export type RitualId = (typeof RITUAL_IDS)[number];
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/, 'lowercase letters, digits and hyphens only');
const timeOfDay = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'expected HH:MM, 24-hour');
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'not a real calendar date');
const assetPath = z
  .string()
  .regex(/^[A-Za-z0-9_\-./]+$/, 'letters, digits, and _ - . / only')
  .refine((value) => !value.startsWith('/') && !value.split('/').includes('..'), {
    message: 'must be a relative path without ".."',
  });
const coordinate = z.number().finite();
const point = z.object({ x: coordinate, z: coordinate });
const itemId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const localizedText = z
  .partialRecord(z.enum(LANGUAGE_CODES), z.string().min(1))
  .refine((text) => text.en !== undefined, 'an English (en) text is required');

const cushion = z.object({ id: itemId, x: coordinate, z: coordinate, facing: coordinate });
const lampSlot = z.object({ id: itemId, x: coordinate, z: coordinate });
const word = z.object({ id: itemId, text: localizedText });

const hallSchema = z.object({
  template: z.enum(HALL_TEMPLATES),
  walkableArea: z.array(point).min(3),
  cushions: z.array(cushion),
  lampSlots: z.array(lampSlot),
  slots: z.object({
    altarBackdrop: assetPath.nullable(),
    banner: assetPath.nullable(),
    plaque: assetPath.nullable(),
    statue: assetPath.nullable(),
  }),
});

const specialDay = z.object({
  date: isoDate,
  name: localizedText,
  extraChanting: z.array(timeOfDay).default([]),
});

/** The shape of a temple manifest (spec section 7). */
export const manifestSchema = z
  .object({
    slug,
    name: localizedText,
    tradition: z.enum(TRADITIONS),
    languages: z.array(z.enum(LANGUAGE_CODES)).min(1),
    timezone: z.string().min(1),
    chantingSchedule: z.array(timeOfDay).min(1),
    specialDays: z.array(specialDay),
    hall: hallSchema,
    audio: z.object({
      ambient: assetPath,
      chanting: assetPath,
      sfx: z.object({ bell: assetPath, beads: assetPath, lamp: assetPath }),
    }),
    rituals: z.array(z.enum(RITUAL_IDS)).min(1),
    nicknames: z.object({
      adjectives: z.array(word).min(1),
      nouns: z.array(word).min(1),
    }),
    donation: z.object({ type: z.literal('link'), url: z.url({ protocol: /^https$/ }) }).nullable(),
  })
  .superRefine((manifest, context) => {
    for (const message of crossFieldProblems(manifest)) {
      context.addIssue({ code: 'custom', message });
    }
  });

/** A validated temple manifest. */
export type TempleManifest = z.infer<typeof manifestSchema>;

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

/** Rules that span several fields, which a field-by-field schema cannot express. */
function crossFieldProblems(manifest: z.infer<typeof manifestSchema>): string[] {
  const problems: string[] = [];
  const { hall } = manifest;
  const walkable: Point[] = hall.walkableArea;
  const lists: Record<string, string[]> = {
    'hall.cushions': hall.cushions.map((item) => item.id),
    'hall.lampSlots': hall.lampSlots.map((item) => item.id),
    'nicknames.adjectives': manifest.nicknames.adjectives.map((item) => item.id),
    'nicknames.nouns': manifest.nicknames.nouns.map((item) => item.id),
    rituals: manifest.rituals,
    languages: manifest.languages,
    specialDays: manifest.specialDays.map((item) => item.date),
  };
  for (const [name, values] of Object.entries(lists)) {
    for (const repeated of new Set(duplicates(values))) {
      problems.push(`${name}: "${repeated}" appears more than once`);
    }
  }
  for (const item of hall.cushions) {
    if (!isPointInPolygon(item, walkable)) {
      problems.push(`hall.cushions: "${item.id}" is outside the walkable area`);
    }
  }
  if (!manifest.languages.includes('en')) {
    problems.push('languages: must include "en"');
  }
  if (manifest.rituals.includes('bow') && hall.cushions.length === 0) {
    problems.push('rituals: "bow" needs at least one cushion');
  }
  if (manifest.rituals.includes('lamp') && hall.lampSlots.length === 0) {
    problems.push('rituals: "lamp" needs at least one lamp slot');
  }
  return problems;
}

/** Thrown when a manifest is invalid. `issues` lists every problem found. */
export class ManifestError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid manifest: ${issues.join('; ')}`);
    this.name = 'ManifestError';
  }
}

/**
 * Validates untrusted manifest data.
 *
 * @param raw - Parsed JSON.
 * @returns The validated manifest.
 * @throws {ManifestError} Listing every problem when the data is invalid.
 */
export function parseManifest(raw: unknown): TempleManifest {
  const result = manifestSchema.safeParse(raw);
  if (!result.success) {
    throw new ManifestError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
