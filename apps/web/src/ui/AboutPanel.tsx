import { flagshipManifest } from '@temple/shared/flagship';
import { useState } from 'react';
import { useLanguage, useT } from '../i18n/I18nProvider';
import { Overlay } from './Overlay';

/** The "About" button and its panel: what is stored, and credits for third-party work (FR-37). */
export function AboutPanel() {
  const t = useT();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const { credits } = flagshipManifest;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {t('about.button')}
      </button>
      {open && (
        <Overlay>
          <h2>{t('about.title')}</h2>
          <p>{t('about.privacy')}</p>
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
          <button type="button" className="secondary" onClick={() => setOpen(false)}>
            {t('button.close')}
          </button>
        </Overlay>
      )}
    </>
  );
}
