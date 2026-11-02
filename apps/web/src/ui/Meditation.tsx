import { DEFAULT_CONFIG } from '@temple/shared';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { Meditation } from '../meditation/useMeditation';
import { formatClock, remainingMs } from '../meditation/session';
import { Overlay } from './Overlay';
import { useNow } from './useNow';

const TICK_MS = 1000;

/** The "Meditate" button and the list of timer lengths it opens (FR-34). */
export function MeditateButton({ meditation }: { meditation: Meditation }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={meditation.session !== null} onClick={() => setOpen(true)}>
        {t('meditation.button')}
      </button>
      {open && (
        <Overlay title={t('meditation.title')} onClose={() => setOpen(false)}>
          <p>{t('meditation.choose')}</p>
          <ul className="hall-list">
            {DEFAULT_CONFIG.meditation.options.map((minutes) => (
              <li key={minutes}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    meditation.start(minutes);
                  }}
                >
                  {t('meditation.minutes', { n: minutes })}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="secondary" onClick={() => setOpen(false)}>
            {t('button.close')}
          </button>
        </Overlay>
      )}
    </>
  );
}

/**
 * Shows the time left, or that the time is up, in the browser tab's title, so a visitor who has
 * switched to another tab can see how long is left (and notice the end) without coming back.
 */
function useTabTitle(label: string | null, appTitle: string): void {
  useEffect(() => {
    if (label === null) {
      return undefined;
    }
    document.title = `${label} · ${appTitle}`;
    return () => {
      document.title = appTitle;
    };
  }, [label, appTitle]);
}

/** The running timer, with a button to stand up, and the message when the time is up. */
export function MeditationBar({ meditation }: { meditation: Meditation }) {
  const t = useT();
  const { session, finished } = meditation;
  const now = useNow(session === null ? null : TICK_MS);
  const timeLeft =
    session?.startedAtMs === null || session === null
      ? null
      : formatClock(remainingMs(session, now));
  useTabTitle(timeLeft ?? (finished ? t('meditation.done') : null), t('app.title'));
  if (session === null) {
    return finished ? (
      <div className="meditation" role="status">
        {t('meditation.done')}
      </div>
    ) : null;
  }
  return (
    <div className="meditation" role="timer">
      <span>
        {session.startedAtMs === null
          ? t('meditation.walking')
          : t('meditation.left', { time: formatClock(remainingMs(session, now)) })}
      </span>
      <button type="button" onClick={meditation.stop}>
        {t('meditation.stop')}
      </button>
    </div>
  );
}
