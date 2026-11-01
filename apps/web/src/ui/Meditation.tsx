import { DEFAULT_CONFIG } from '@temple/shared';
import { useState } from 'react';
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
        <Overlay>
          <h2>{t('meditation.title')}</h2>
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

/** The running timer, with a button to stand up, and the message when the time is up. */
export function MeditationBar({ meditation }: { meditation: Meditation }) {
  const t = useT();
  const { session, finished } = meditation;
  const now = useNow(session === null ? null : TICK_MS);
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
