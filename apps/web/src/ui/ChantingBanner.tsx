import { useT } from '../i18n/I18nProvider';
import type { HallState } from '../net/hallState';
import { useNow } from './useNow';

const TICK_MS = 1000;

/** Says that communal chanting is about to begin, or is on, using the server's clock. */
export function ChantingBanner({ state }: { state: HallState }) {
  const t = useT();
  const { chanting } = state;
  const now = useNow(chanting === null ? null : TICK_MS) + state.clockOffsetMs;
  if (
    state.status !== 'joined' ||
    chanting === null ||
    now >= chanting.startAtMs + chanting.durationMs
  ) {
    return null;
  }
  return (
    <div className="chanting-banner" role="status">
      {now < chanting.startAtMs ? t('chanting.soon') : t('chanting.live')}
    </div>
  );
}
