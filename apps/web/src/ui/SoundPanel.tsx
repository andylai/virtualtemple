import { useState, useSyncExternalStore } from 'react';
import type { AudioEngine, Layer } from '../audio/engine';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Overlay } from './Overlay';

const PERCENT = 100;

const LAYERS: readonly { layer: Layer; label: MessageKey }[] = [
  { layer: 'ambient', label: 'sound.ambient' },
  { layer: 'chanting', label: 'sound.chanting' },
  { layer: 'sfx', label: 'sound.effects' },
];

/** The "Sound" button and the panel it opens: three volumes, and the visitor's own chanting (FR-23, FR-24). */
export function SoundPanel({ engine }: { engine: AudioEngine }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const sound = useSyncExternalStore(engine.subscribe, engine.getSnapshot);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {t('sound.button')}
      </button>
      {open && (
        <Overlay>
          <h2>{t('sound.title')}</h2>
          {LAYERS.map(({ layer, label }) => (
            <label key={layer} className="slider">
              <span>{t(label)}</span>
              <input
                type="range"
                min={0}
                max={PERCENT}
                value={Math.round(sound.volumes[layer] * PERCENT)}
                onChange={(event) => engine.setVolume(layer, Number(event.target.value) / PERCENT)}
              />
            </label>
          ))}
          <p>
            <button
              type="button"
              disabled={sound.communalChanting}
              onClick={() => engine.togglePersonalChanting()}
            >
              {sound.personalChanting ? t('sound.stopChanting') : t('sound.playChanting')}
            </button>
          </p>
          {sound.communalChanting && <p>{t('sound.communalNote')}</p>}
          <button type="button" className="secondary" onClick={() => setOpen(false)}>
            {t('button.close')}
          </button>
        </Overlay>
      )}
    </>
  );
}
