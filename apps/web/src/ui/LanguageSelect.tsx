import { flagshipManifest } from '@temple/shared/flagship';
import { useLanguage, useT } from '../i18n/I18nProvider';
import { availableLanguages, HTML_LANGUAGE_TAGS } from '../i18n/translate';
import { preferencesStore } from '../prefs/preferences';
import { LANGUAGE_NAMES } from './languageNames';

/** The same language control on arrival and in Settings keeps the saved choice consistent. */
export function LanguageSelect() {
  const t = useT();
  const language = useLanguage();
  const languages = availableLanguages(flagshipManifest.languages);
  if (languages.length < 2) return null;
  return (
    <fieldset className="language-picker">
      <legend>{t('settings.language')}</legend>
      <div className="language-options">
        {languages.map((code) => (
          <button
            key={code}
            type="button"
            lang={HTML_LANGUAGE_TAGS[code]}
            aria-pressed={language === code}
            onClick={() => preferencesStore().update({ language: code })}
          >
            {LANGUAGE_NAMES[code]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
