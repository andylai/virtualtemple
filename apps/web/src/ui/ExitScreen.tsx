import { useT } from '../i18n/I18nProvider';
import { Overlay } from './Overlay';

/** Shown when the visitor has left: a gentle goodbye and a way back (FR-4). */
export function ExitScreen({ onStayAgain }: { onStayAgain: () => void }) {
  const t = useT();
  return (
    <Overlay>
      <h1>{t('exit.title')}</h1>
      <p>{t('exit.body')}</p>
      <button type="button" onClick={onStayAgain}>
        {t('exit.stayAgain')}
      </button>
    </Overlay>
  );
}
