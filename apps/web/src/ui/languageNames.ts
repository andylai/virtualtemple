import type { LanguageCode } from '@temple/shared';

/** Each language's own name. Names are not translated: someone must be able to find their own language. */
export const LANGUAGE_NAMES: Readonly<Record<LanguageCode, string>> = {
  en: 'English',
  ms: 'Bahasa Melayu',
  zh: '简体中文',
};
