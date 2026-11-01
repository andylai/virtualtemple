import { RITUALS, type RitualId } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { useT } from '../i18n/I18nProvider';
import { RITUAL_BUTTON_KEYS } from './ritualLabels';

interface RitualBarProps {
  onStart: (ritualId: RitualId) => void;
  onStop: () => void;
  /** Whether a bow is under way, so there is something to stop. */
  canStop: boolean;
}

/** The rituals as buttons, for phones and for anyone who prefers to tap (FR-38), and the stop button. */
export function RitualBar({ onStart, onStop, canStop }: RitualBarProps) {
  const t = useT();
  return (
    <div className="ritual-bar">
      {flagshipManifest.rituals.map((id) => (
        <button
          key={id}
          type="button"
          aria-keyshortcuts={RITUALS[id].keys.join(' ')}
          onClick={() => onStart(id)}
        >
          {t(RITUAL_BUTTON_KEYS[id])}
        </button>
      ))}
      {canStop && (
        <button type="button" className="stop" onClick={onStop}>
          {t('ritual.stop')}
        </button>
      )}
    </div>
  );
}
