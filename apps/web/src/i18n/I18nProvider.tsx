import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { LanguageCode } from '@temple/shared';
import type { MessageKey } from './en';
import { pickLanguage, translate, type MessageParams } from './translate';

type Translator = (key: MessageKey, params?: MessageParams) => string;

const I18nContext = createContext<{ language: LanguageCode; t: Translator } | null>(null);

/** Supplies `t()` to the app and keeps the page's `lang` attribute in step. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => {
    const language = pickLanguage(navigator.languages);
    const t: Translator = (key, params) => translate(language, key, params);
    return { language, t };
  }, []);
  useEffect(() => {
    document.documentElement.lang = value.language;
    document.title = value.t('app.title');
  }, [value]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Returns the translate function. Must be used inside `I18nProvider`. */
export function useT(): Translator {
  const context = useContext(I18nContext);
  if (context === null) {
    throw new Error('useT must be used inside I18nProvider');
  }
  return context.t;
}
