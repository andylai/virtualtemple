import { useState } from 'react';
import { useT } from '../i18n/I18nProvider';
import { HallIcon } from './HallIcon';
import { HeartSutraReader } from './HeartSutraReader';
import { MantraReader, type MantraId } from './MantraReader';
import { Overlay } from './Overlay';

/** A short selection screen makes the chant readers accessible from the ritual dock. */
export function Chanting() {
  const t = useT();
  const [panel, setPanel] = useState<'tracks' | 'heartSutra' | MantraId | null>(null);
  return (
    <>
      <button type="button" onClick={() => setPanel('tracks')}>
        <HallIcon name="chant" />
        {t('sound.chanting')}
      </button>
      {panel === 'tracks' && (
        <Overlay title={t('sound.chanting')} onClose={() => setPanel(null)}>
          <div className="chanting-choices">
            <button type="button" onClick={() => setPanel('heartSutra')}>
              {t('chanting.heartSutra')}
            </button>
            <button type="button" onClick={() => setPanel('sixSyllable')}>
              {t('chanting.sixSyllable')}
            </button>
            <button type="button" onClick={() => setPanel('greatCompassion')}>
              {t('chanting.greatCompassion')}
            </button>
            <button type="button" className="secondary" onClick={() => setPanel(null)}>
              {t('button.close')}
            </button>
          </div>
        </Overlay>
      )}
      {panel === 'heartSutra' && <HeartSutraReader onBack={() => setPanel('tracks')} />}
      {(panel === 'sixSyllable' || panel === 'greatCompassion') && (
        <MantraReader mantra={panel} onBack={() => setPanel('tracks')} />
      )}
    </>
  );
}
