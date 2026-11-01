import { LANGUAGE_CODES, type LanguageCode } from '@temple/shared';
import { en, type Catalog, type MessageKey } from './en';

/** Translations that exist. Add a language by adding its file here; no other code changes. */
export const CATALOGS: Readonly<Partial<Record<LanguageCode, Catalog>>> = { en };

/** The language used when the visitor's language has no translation yet. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

/** Values filled into `{name}` markers. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Looks up a message and fills in its `{name}` markers.
 *
 * @param language - The wanted language. A language without a catalog falls back to English.
 * @param key - The message key.
 * @param params - Values for the markers. A marker with no value is left visible so the gap shows.
 */
export function translate(
  language: LanguageCode,
  key: MessageKey,
  params: MessageParams = {},
): string {
  const catalog = CATALOGS[language] ?? CATALOGS[FALLBACK_LANGUAGE] ?? en;
  return catalog[key].replace(/\{(\w+)\}/g, (marker, name: string) => {
    const value = params[name];
    return value === undefined ? marker : String(value);
  });
}

/**
 * Picks the best available language for a list of browser language tags such as `["ms-MY", "en"]`.
 *
 * @param tags - Preferred languages, most wanted first.
 * @param available - Languages that have a catalog.
 */
export function pickLanguage(
  tags: readonly string[],
  available: readonly LanguageCode[] = Object.keys(CATALOGS) as LanguageCode[],
): LanguageCode {
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0];
    const match = LANGUAGE_CODES.find((code) => code === base);
    if (match !== undefined && available.includes(match)) {
      return match;
    }
  }
  return FALLBACK_LANGUAGE;
}
