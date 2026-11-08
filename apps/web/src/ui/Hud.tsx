import { flagshipManifest } from '@temple/shared/flagship';
import { nicknameText } from '@temple/shared';
import { useLanguage, useT } from '../i18n/I18nProvider';
import type { HallState } from '../net/hallState';

/** The small panel in the corner: which hall, how many people, and who you are. */
export function Hud({ state }: { state: HallState }) {
  const t = useT();
  const language = useLanguage();
  if (state.status !== 'joined' || state.hall === null || state.nickname === null) {
    return null;
  }
  const name = nicknameText(flagshipManifest.nicknames, state.nickname, language);
  return (
    <div className="hall-identity">
      <h1>{t('app.wordmark')}</h1>
      <div className="hall-meta">
        <span>{t('hud.hall', { n: state.hall })}</span>
        <span aria-hidden="true">·</span>
        <span>
          {state.population === 1
            ? t('hud.people.one')
            : t('hud.people.other', { count: state.population })}
        </span>
        <span aria-hidden="true">·</span>
        <span>{t('hud.you', { name })}</span>
      </div>
    </div>
  );
}
