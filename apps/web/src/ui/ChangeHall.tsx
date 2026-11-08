import { HallIcon } from './HallIcon';
import type { HallsResponse } from '@temple/shared';
import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { fetchHalls } from '../net/hallsApi';
import { describeHall } from './hallLabels';
import { Overlay } from './Overlay';

interface ChangeHallProps {
  /** The hall the visitor is in. */
  currentHall: number | null;
  /** Called with the hall the visitor picked. */
  onPick: (hall: number) => void;
}

/** The "Change hall" button and the list it opens: halls with people, plus the next empty one. */
export function ChangeHall({ currentHall, onPick }: ChangeHallProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<HallsResponse | null | 'loading'>('loading');

  const show = () => {
    setOpen(true);
    setListing('loading');
    void fetchHalls().then(setListing);
  };

  return (
    <>
      <button type="button" onClick={show}>
        <HallIcon name="hall" />
        {t('hall.change')}
      </button>
      {open && (
        <Overlay title={t('hall.change')} onClose={() => setOpen(false)}>
          {listing === 'loading' && <p>{t('hall.loading')}</p>}
          {listing === null && <p>{t('hall.listError')}</p>}
          {listing !== null && listing !== 'loading' && (
            <ul className="hall-list">
              {listing.halls.map((hall) => {
                const { key, params } = describeHall(hall, currentHall);
                return (
                  <li key={hall.hall}>
                    <button
                      type="button"
                      disabled={hall.full || hall.hall === currentHall}
                      onClick={() => {
                        setOpen(false);
                        onPick(hall.hall);
                      }}
                    >
                      {t(key, params)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="secondary" onClick={() => setOpen(false)}>
            {t('button.close')}
          </button>
        </Overlay>
      )}
    </>
  );
}
