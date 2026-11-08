import { HallIcon } from './HallIcon';
import { DEFAULT_CONFIG } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { useState, useSyncExternalStore } from 'react';
import type { AudioEngine, EngineSnapshot, Layer } from '../audio/engine';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { effectiveReduceMotion, preferencesStore } from '../prefs/preferences';
import { useDeviceReducesMotion, usePreferences } from '../prefs/usePreferences';
import { LanguageSelect } from './LanguageSelect';
import { Overlay } from './Overlay';

const PERCENT = 100;

const HAS_GROUP_CHANTING =
  flagshipManifest.chantingSchedule.length > 0 ||
  flagshipManifest.specialDays.some(({ extraChanting }) => extraChanting.length > 0);

const LAYERS: readonly { layer: Layer; label: MessageKey }[] = [
  { layer: 'ambient', label: 'sound.ambient' },
  { layer: 'chanting', label: 'sound.chanting' },
  { layer: 'sfx', label: 'sound.effects' },
];

/** The sliders let visitors balance the sound layers available at launch. */
function SoundControls({ engine, sound }: { engine: AudioEngine; sound: EngineSnapshot }) {
  const t = useT();
  return (
    <>
      {LAYERS.filter(({ layer }) => layer !== 'chanting' || HAS_GROUP_CHANTING).map(
        ({ layer, label }) => (
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
        ),
      )}
    </>
  );
}

/** Sound in the background, reduced motion, and language (FR-25, FR-36). */
function PreferenceControls() {
  const t = useT();
  const preferences = usePreferences();
  const deviceReducesMotion = useDeviceReducesMotion();
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={preferences.backgroundPlay}
          onChange={(event) => preferencesStore().update({ backgroundPlay: event.target.checked })}
        />
        <span>{t('settings.backgroundPlay')}</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={effectiveReduceMotion(preferences, deviceReducesMotion)}
          onChange={(event) => preferencesStore().update({ reduceMotion: event.target.checked })}
        />
        <span>{t('settings.reduceMotion')}</span>
      </label>
      <LanguageSelect />
    </>
  );
}

/** The "Settings" button and its panel, with a way to forget what the browser remembers (FR-3). */
export function SettingsPanel({ engine }: { engine: AudioEngine }) {
  const t = useT();
  const sound = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [open, setOpen] = useState(false);

  const forget = () => {
    preferencesStore().forget();
    (Object.keys(DEFAULT_CONFIG.audio.defaultVolumes) as Layer[]).forEach((layer) =>
      engine.setVolume(layer, DEFAULT_CONFIG.audio.defaultVolumes[layer]),
    );
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        <HallIcon name="settings" />
        {t('settings.button')}
      </button>
      {open && (
        <Overlay title={t('settings.title')} onClose={() => setOpen(false)}>
          <SoundControls engine={engine} sound={sound} />
          <PreferenceControls />
          <p>
            <button type="button" className="secondary" onClick={forget}>
              {t('settings.forget')}
            </button>
          </p>
          <button type="button" className="secondary" onClick={() => setOpen(false)}>
            {t('button.close')}
          </button>
        </Overlay>
      )}
    </>
  );
}
