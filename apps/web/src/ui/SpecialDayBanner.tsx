import { useLanguage, useT } from '../i18n/I18nProvider';
import type { HallState } from '../net/hallState';

/** Shows today's special day, in the visitor's language or else English (spec 3.8). */
export function SpecialDayBanner({ state }: { state: HallState }) {
  const t = useT();
  const language = useLanguage();
  const { specialDay } = state;
  if (state.status !== 'joined' || specialDay === null) {
    return null;
  }
  const name = specialDay.name[language] ?? specialDay.name.en;
  return name === undefined ? null : (
    <div className="special-day" role="status">
      {t('specialDay.today', { name })}
    </div>
  );
}
