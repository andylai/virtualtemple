import { GREAT_COMPASSION_MANTRA } from '../chanting/greatCompassionMantra';
import { useT } from '../i18n/I18nProvider';
import { Overlay } from './Overlay';

const TORONTO_SIX_SYLLABLE = 'https://www.buddhismtoronto.com/ct/mantra-4.2.php';
const TORONTO_COMPASSION = 'https://www.buddhismtoronto.com/ct/mantra-2.2.php';

/** Use the Tibetan pronunciation column from the linked guide. */
const TIBETAN_PRONUNCIATION = [
  ['唵', 'om'],
  ['嘛', 'ma'],
  ['呢', 'ni'],
  ['叭', 'bê'],
  ['彌', 'mê'],
  ['吽', 'hum'],
] as const;

/** Identifies the two mantra readers without using their translated names as keys. */
export type MantraId = 'sixSyllable' | 'greatCompassion';

/** Readers share the sutra layout so back navigation and long-text scrolling work the same way. */
export function MantraReader({ mantra, onBack }: { mantra: MantraId; onBack: () => void }) {
  const t = useT();
  const sixSyllable = mantra === 'sixSyllable';
  return (
    <Overlay
      title={sixSyllable ? t('chanting.sixSyllable') : t('chanting.greatCompassion')}
      onClose={onBack}
    >
      <button type="button" className="secondary sutra-back" onClick={onBack}>
        {t('chanting.backToTracks')}
      </button>
      <article className="sutra-text">
        {sixSyllable ? (
          <>
            <h3>{t('chanting.tibetanPronunciation')}</h3>
            <p className="mantra-syllables" lang="zh-Hant">
              {TIBETAN_PRONUNCIATION.map(([character, pronunciation]) => (
                <span key={character}>
                  {character}
                  <span className="sutra-pinyin" lang="bo-Latn">
                    {pronunciation}
                  </span>
                </span>
              ))}
            </p>
          </>
        ) : (
          <div lang="zh-Hant">
            <h3>千手千眼無礙大悲心陀羅尼</h3>
            {GREAT_COMPASSION_MANTRA.map(([line, pinyin], index) => (
              <p key={index}>
                <span>{line}</span>
                <span className="sutra-pinyin" lang="zh-Latn-pinyin">
                  {pinyin}
                </span>
              </p>
            ))}
          </div>
        )}
        <footer>
          {t('chanting.source')}{' '}
          <a href={sixSyllable ? TORONTO_SIX_SYLLABLE : TORONTO_COMPASSION}>Buddhism Toronto</a>
        </footer>
      </article>
    </Overlay>
  );
}
