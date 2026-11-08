import { LANGUAGE_CODES, type LanguageCode } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { en, type Catalog, type MessageKey } from './en';
import { ms } from './ms';
import { zh } from './zh';

/** Translations that exist. Add a language by adding its file here; no other code changes. */
export const CATALOGS: Readonly<Partial<Record<LanguageCode, Catalog>>> = { en, ms, zh };

/**
 * The languages a visitor can use: those that have a catalog and that the temple's manifest offers.
 * A draft translation stays unseen until the manifest lists it, so nothing unreviewed reaches visitors.
 *
 * @param offered - The manifest's `languages`.
 * @param catalogs - Which catalogs exist (replaceable for tests).
 */
export function availableLanguages(
  offered: readonly LanguageCode[],
  catalogs: Readonly<Partial<Record<LanguageCode, Catalog>>> = CATALOGS,
): LanguageCode[] {
  return LANGUAGE_CODES.filter((code) => catalogs[code] !== undefined && offered.includes(code));
}

/** The language used when the visitor's language has no translation yet. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

/** The Chinese catalog uses Simplified characters, so browsers can select the right voice and fonts. */
export const HTML_LANGUAGE_TAGS: Readonly<Record<LanguageCode, string>> = {
  en: 'en',
  ms: 'ms',
  zh: 'zh-Hans',
};

/** Values filled into `{name}` markers. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Looks up a message and fills in its `{name}` markers.
 *
 * @param language - The wanted language. A language without a catalog falls back to English.
 * @param key - The message key.
 * @param params - Values for the markers. A marker with no value is left visible so the gap shows.
 * @param catalogs - Which catalogs exist (replaceable for tests).
 */
export function translate(
  language: LanguageCode,
  key: MessageKey,
  params: MessageParams = {},
  catalogs: Readonly<Partial<Record<LanguageCode, Catalog>>> = CATALOGS,
): string {
  const catalog = catalogs[language] ?? catalogs[FALLBACK_LANGUAGE] ?? en;
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
  available: readonly LanguageCode[] = availableLanguages(flagshipManifest.languages),
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

/** An explicit choice takes priority over the browser, as long as the temple still offers it. */
export function resolveLanguage(
  preferred: LanguageCode | null,
  browserTags: readonly string[],
): LanguageCode {
  const available = availableLanguages(flagshipManifest.languages);
  return preferred !== null && available.includes(preferred)
    ? preferred
    : pickLanguage(browserTags, available);
}
