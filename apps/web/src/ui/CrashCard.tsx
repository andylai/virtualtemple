import { useT } from '../i18n/I18nProvider';
import { Overlay } from './Overlay';

/** Shown in place of the app when it crashed: says so plainly and offers a reload. */
export function CrashCard() {
  const t = useT();
  return (
    <Overlay title={t('error.crashed')} level={1}>
      <p>{t('error.crashedBody')}</p>
      <button type="button" autoFocus onClick={() => window.location.reload()}>
        {t('error.reload')}
      </button>
    </Overlay>
  );
}
