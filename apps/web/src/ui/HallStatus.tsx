import { useT } from '../i18n/I18nProvider';
import type { HallState } from '../net/hallState';
import { Overlay } from './Overlay';

/** Messages shown over the hall when the visitor is out of it, with the button that returns. */
const OUT_OF_HALL = {
  hall_full: { message: 'status.hallFull', button: 'button.tryAgain' },
  away: { message: 'status.away', button: 'enter.button' },
  replaced: { message: 'status.replaced', button: 'button.tryAgain' },
  disconnected: { message: 'status.disconnected', button: 'button.tryAgain' },
} as const;

type OutOfHallStatus = keyof typeof OUT_OF_HALL;

function isOutOfHall(status: HallState['status']): status is OutOfHallStatus {
  return status in OUT_OF_HALL;
}

/** Shows how the connection to the hall is doing: joining, reconnecting, or out of the hall. */
export function HallStatus({ state, onRetry }: { state: HallState; onRetry: () => void }) {
  const t = useT();
  if (state.status === 'connecting') {
    return <div className="banner">{t('status.connecting')}</div>;
  }
  if (state.status === 'reconnecting') {
    return <div className="banner">{t('status.reconnecting')}</div>;
  }
  if (!isOutOfHall(state.status)) {
    return null;
  }
  const { message, button } = OUT_OF_HALL[state.status];
  return (
    <Overlay>
      <p>{t(message)}</p>
      <button type="button" onClick={onRetry}>
        {t(button)}
      </button>
    </Overlay>
  );
}
