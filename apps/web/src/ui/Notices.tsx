import { DEFAULT_CONFIG } from '@temple/shared';
import { useEffect } from 'react';
import { useT } from '../i18n/I18nProvider';
import type { HallState } from '../net/hallState';
import { ritualNoticeKey } from './ritualLabels';

const MS_PER_SECOND = 1000;

interface NoticesProps {
  state: HallState;
  /** Called when the "placed in another hall" message has been shown long enough. */
  onNoticeShown: () => void;
  /** Called when the "no free cushion" kind of message has been shown long enough. */
  onRitualNoticeShown: () => void;
}

/** Calls `onDone` after the message has been on screen for a toast's lifetime. */
function useExpiry(active: boolean, onDone: () => void): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = setTimeout(onDone, DEFAULT_CONFIG.ui.toastSeconds * MS_PER_SECOND);
    return () => clearTimeout(timer);
  }, [active, onDone]);
}

/** Short messages about the visitor's own actions: placed in another hall, no free cushion. */
export function Notices({ state, onNoticeShown, onRitualNoticeShown }: NoticesProps) {
  const t = useT();
  const joined = state.status === 'joined' && state.hall !== null;
  const notice = joined ? state.notice : null;
  const ritualNotice = joined ? state.ritualNotice : null;
  useExpiry(notice !== null, onNoticeShown);
  useExpiry(ritualNotice !== null, onRitualNoticeShown);
  return (
    <>
      {notice !== null && (
        <div className="banner" role="status">
          {t('status.placed', { from: notice.fromHall, to: notice.toHall })}
        </div>
      )}
      {ritualNotice !== null && (
        <div className="banner" role="status">
          {t(ritualNoticeKey(ritualNotice))}
        </div>
      )}
    </>
  );
}
