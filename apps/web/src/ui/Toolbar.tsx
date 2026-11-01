import { useEffect } from 'react';
import { DEFAULT_CONFIG } from '@temple/shared';
import { useT } from '../i18n/I18nProvider';
import type { HallState } from '../net/hallState';
import { ChangeHall } from './ChangeHall';
import { InviteButton } from './InviteButton';

const MS_PER_SECOND = 1000;

interface ToolbarProps {
  state: HallState;
  onPickHall: (hall: number) => void;
  /** Called when the "placed in another hall" message has been shown long enough. */
  onNoticeShown: () => void;
}

/** The buttons along the bottom while the visitor is in a hall, and the "placed in Hall N" message. */
export function Toolbar({ state, onPickHall, onNoticeShown }: ToolbarProps) {
  const t = useT();
  const joined = state.status === 'joined' && state.hall !== null;
  const notice = joined ? state.notice : null;

  useEffect(() => {
    if (notice === null) {
      return undefined;
    }
    const timer = setTimeout(onNoticeShown, DEFAULT_CONFIG.ui.toastSeconds * MS_PER_SECOND);
    return () => clearTimeout(timer);
  }, [notice, onNoticeShown]);

  if (!joined || state.hall === null) {
    return null;
  }
  return (
    <>
      {notice !== null && (
        <div className="banner" role="status">
          {t('status.placed', { from: notice.fromHall, to: notice.toHall })}
        </div>
      )}
      <div className="toolbar">
        <ChangeHall currentHall={state.hall} onPick={onPickHall} />
        <InviteButton hall={state.hall} />
      </div>
    </>
  );
}
