import type { HallSummary } from '@temple/shared';
import type { MessageKey } from '../i18n/en';
import type { MessageParams } from '../i18n/translate';

/**
 * Picks the wording for one line of the "Change hall" list.
 *
 * @param hall - The hall and its people.
 * @param currentHall - The hall the visitor is in, or null.
 */
export function describeHall(
  hall: HallSummary,
  currentHall: number | null,
): { key: MessageKey; params: MessageParams } {
  const params = { n: hall.hall, count: hall.count };
  if (hall.hall === currentHall) {
    return { key: 'hall.entry.here', params };
  }
  if (hall.full) {
    return { key: 'hall.entry.full', params };
  }
  if (hall.count === 0) {
    return { key: 'hall.entry.empty', params };
  }
  return { key: hall.count === 1 ? 'hall.entry.one' : 'hall.entry.other', params };
}
