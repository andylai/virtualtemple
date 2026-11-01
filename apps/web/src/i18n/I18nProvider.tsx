import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { LanguageCode } from '@temple/shared';
import type { MessageKey } from './en';
import { usePreferences } from '../prefs/usePreferences';
import { CATALOGS, pickLanguage, translate, type MessageParams } from './translate';

type Translator = (key: MessageKey, params?: MessageParams) => string;

interface I18nValue {
  language: LanguageCode;
  t: Translator;
}

const I18nContext = createContext<I18nValue | null>(null);

/** Supplies `t()` to the app and keeps the page's `lang` attribute in step. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const preferred = usePreferences().language;
  const value = useMemo(() => {
    const chosen = preferred !== null && CATALOGS[preferred] !== undefined ? preferred : null;
    const language = chosen ?? pickLanguage(navigator.languages);
    const t: Translator = (key, params) => translate(language, key, params);
    return { language, t };
  }, [preferred]);
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

/** Returns the language in use, for example to pick the right word from a manifest. */
export function useLanguage(): LanguageCode {
  const context = useContext(I18nContext);
  if (context === null) {
    throw new Error('useLanguage must be used inside I18nProvider');
  }
  return context.language;
}
