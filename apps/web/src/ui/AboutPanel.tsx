import { HallIcon } from './HallIcon';
import { flagshipManifest } from '@temple/shared/flagship';
import { useState } from 'react';
import { useLanguage, useT } from '../i18n/I18nProvider';
import { Overlay } from './Overlay';
import { TermsPanel } from './TermsPanel';

/** The "About" button and its panel: what is stored, and credits for third-party work (FR-37). */
export function AboutPanel() {
  const t = useT();
  const language = useLanguage();
  const [panel, setPanel] = useState<'about' | 'terms' | null>(null);
  const { credits } = flagshipManifest;

  return (
    <>
      <button type="button" onClick={() => setPanel('about')}>
        <HallIcon name="about" />
        {t('about.button')}
      </button>
      {panel === 'about' && (
        <Overlay title={t('about.title')} onClose={() => setPanel(null)}>
          <p>{t('about.privacy')}</p>
          <button type="button" className="secondary" onClick={() => setPanel('terms')}>
            {t('about.termsLink')}
          </button>
          <h3>{t('about.controls')}</h3>
          <p>{t('about.controlsBody')}</p>
          <h3>{t('about.credits')}</h3>
          {credits.length === 0 ? (
            <p>{t('about.noCredits')}</p>
          ) : (
            <ul className="credits">
              {credits.map((credit) => (
                <li key={`${credit.by}:${credit.title.en}`}>
                  {credit.url === undefined ? (
                    <span>{credit.title[language] ?? credit.title.en}</span>
                  ) : (
                    <a href={credit.url} target="_blank" rel="noreferrer noopener">
                      {credit.title[language] ?? credit.title.en}
                    </a>
                  )}{' '}
                  — {credit.by}, {credit.license}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="secondary" onClick={() => setPanel(null)}>
            {t('button.close')}
          </button>
        </Overlay>
      )}
      {panel === 'terms' && <TermsPanel onBack={() => setPanel('about')} />}
    </>
  );
}
