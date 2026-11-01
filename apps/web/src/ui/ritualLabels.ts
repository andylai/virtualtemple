import type { RitualId } from '@temple/shared';
import type { MessageKey } from '../i18n/en';
import type { RitualNotice } from '../net/hallState';

/** The button text of each ritual. */
export const RITUAL_BUTTON_KEYS: Readonly<Record<RitualId, MessageKey>> = {
  greet: 'ritual.greet',
  bow: 'ritual.bow',
  lamp: 'ritual.lamp',
};

/** The toast text of each ritual, shown to the others in the hall. */
export const RITUAL_TOAST_KEYS: Readonly<Record<RitualId, MessageKey>> = {
  greet: 'toast.greet',
  bow: 'toast.bow',
  lamp: 'toast.lamp',
};

/**
 * Picks the message for a ritual that did not start.
 *
 * @param notice - What the hall answered, with the ritual that was asked for.
 */
export function ritualNoticeKey(notice: RitualNotice): MessageKey {
  if (notice.code === 'lamp_limit') {
    return 'ritual.lampLimit';
  }
  return notice.ritualId === 'lamp' ? 'ritual.noLampPlace' : 'ritual.noCushion';
}
