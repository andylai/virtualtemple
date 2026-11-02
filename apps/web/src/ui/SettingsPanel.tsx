import { DEFAULT_CONFIG, type LanguageCode } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { useState, useSyncExternalStore } from 'react';
import type { AudioEngine, EngineSnapshot, Layer } from '../audio/engine';
import { useLanguage, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { availableLanguages } from '../i18n/translate';
import { effectiveReduceMotion, preferencesStore } from '../prefs/preferences';
import { useDeviceReducesMotion, usePreferences } from '../prefs/usePreferences';
import { LANGUAGE_NAMES } from './languageNames';
import { Overlay } from './Overlay';

const PERCENT = 100;

const LAYERS: readonly { layer: Layer; label: MessageKey }[] = [
  { layer: 'ambient', label: 'sound.ambient' },
  { layer: 'chanting', label: 'sound.chanting' },
  { layer: 'sfx', label: 'sound.effects' },
];

/** The three volume sliders and the visitor's own chanting (FR-23, FR-24). */
function SoundControls({ engine, sound }: { engine: AudioEngine; sound: EngineSnapshot }) {
  const t = useT();
  return (
    <>
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
    </>
  );
}

/** Sound in the background, reduced motion, and language (FR-25, FR-36). */
function PreferenceControls() {
  const t = useT();
  const language = useLanguage();
  const preferences = usePreferences();
  const deviceReducesMotion = useDeviceReducesMotion();
  const languages = availableLanguages(flagshipManifest.languages);
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
      {languages.length > 1 && (
        <label className="slider">
          <span>{t('settings.language')}</span>
          <select
            value={language}
            onChange={(event) =>
              preferencesStore().update({ language: event.target.value as LanguageCode })
            }
          >
            {languages.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
      )}
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
