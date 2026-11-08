import { useState } from 'react';
import { HEART_SUTRA_CHINESE } from '../chanting/heartSutraChinese';
import { HEART_SUTRA_ENGLISH } from '../chanting/heartSutraEnglish';
import { useLanguage, useT } from '../i18n/I18nProvider';
import { Overlay } from './Overlay';

const ENGLISH_SOURCE = 'https://plumvillage.org/library/sutras/the-heart-sutra';
const ENGLISH_LICENSE = 'https://creativecommons.org/licenses/by-nc/4.0/';
const CHINESE_SOURCE = 'https://cbetaonline.dila.edu.tw/en/T0251_001';

/** Keep the source, translator and reuse terms beside the edition they describe. */
function EnglishSutra() {
  return (
    <article className="sutra-text sutra-english" lang="en">
      <h3>The Insight that Brings Us to the Other Shore</h3>
      {HEART_SUTRA_ENGLISH.map((verse) => (
        <p key={verse}>{verse}</p>
      ))}
      <footer>
        Translated by Thich Nhat Hanh (2014). <a href={ENGLISH_SOURCE}>Plum Village</a> ·{' '}
        <a href={ENGLISH_LICENSE}>CC BY-NC 4.0</a>
      </footer>
    </article>
  );
}

/** Keep each pronunciation guide with the Chinese line it describes as the layout wraps. */
function ChineseSutra() {
  return (
    <article className="sutra-text" lang="zh-Hans">
      <h3>般若波罗蜜多心经</h3>
      <p lang="zh-Latn-pinyin">Bōrě bōluómìduō xīnjīng</p>
      {HEART_SUTRA_CHINESE.map(([line, pinyin]) => (
        <p key={line}>
          <span>{line}</span>
          <span className="sutra-pinyin" lang="zh-Latn-pinyin">
            {pinyin}
          </span>
        </p>
      ))}
      <footer>
        玄奘译 · <a href={CHINESE_SOURCE}>CBETA 电子佛典 T0251</a>
      </footer>
    </article>
  );
}

/** Read at your own pace, even when the chant has no audio recording. */
export function HeartSutraReader({ onBack }: { onBack: () => void }) {
  const t = useT();
  const language = useLanguage();
  const [edition, setEdition] = useState<'en' | 'zh'>(language === 'zh' ? 'zh' : 'en');
  return (
    <Overlay title={t('chanting.heartSutra')} onClose={onBack}>
      <button className="secondary sutra-back" type="button" onClick={onBack}>
        {t('chanting.backToTracks')}
      </button>
      <fieldset className="language-picker">
        <legend>{t('settings.language')}</legend>
        <div className="language-options">
          <button
            type="button"
            lang="en"
            aria-pressed={edition === 'en'}
            onClick={() => setEdition('en')}
          >
            English
          </button>
          <button
            type="button"
            lang="zh-Hans"
            aria-pressed={edition === 'zh'}
            onClick={() => setEdition('zh')}
          >
            简体中文 + 拼音
          </button>
        </div>
      </fieldset>
      <p className="sutra-duration">
        {edition === 'zh'
          ? t('chanting.heartSutraChineseTime')
          : t('chanting.heartSutraEnglishTime')}
      </p>
      {edition === 'zh' ? <ChineseSutra /> : <EnglishSutra />}
    </Overlay>
  );
}
