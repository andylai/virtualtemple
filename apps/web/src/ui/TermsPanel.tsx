import { useEffect, useState } from 'react';
import { useLanguage, useT } from '../i18n/I18nProvider';
import { Overlay } from './Overlay';

interface TermsBlock {
  heading: boolean;
  text: string;
}

/** Read the published terms as text so the dialog and direct pages use the same wording. */
async function readTerms(path: string, signal: AbortSignal): Promise<TermsBlock[]> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error('Terms unavailable');
  const page = new DOMParser().parseFromString(await response.text(), 'text/html');
  const blocks = [...page.querySelectorAll('main > h2, main > p')].map((node) => ({
    heading: node.tagName === 'H2',
    text: node.textContent.trim(),
  }));
  if (blocks.length === 0) throw new Error('Terms unavailable');
  return blocks;
}

/** A hall dialog lets visitors read the current language’s terms without navigating away. */
export function TermsPanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const path = useLanguage() === 'zh' ? '/terms-zh.html' : '/terms.html';
  const [content, setContent] = useState<TermsBlock[] | 'loading' | 'unavailable'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    void readTerms(path, controller.signal).then(
      (blocks) => {
        if (!controller.signal.aborted) setContent(blocks);
      },
      () => {
        if (!controller.signal.aborted) setContent('unavailable');
      },
    );
    return () => controller.abort();
  }, [path]);

  return (
    <Overlay title={t('about.termsLink')} onClose={onBack}>
      <button type="button" className="secondary" onClick={onBack}>
        {t('terms.backToAbout')}
      </button>
      {content === 'loading' && <p role="status">{t('terms.loading')}</p>}
      {content === 'unavailable' && <p role="status">{t('terms.unavailable')}</p>}
      {Array.isArray(content) && (
        <div className="terms-content" lang={path === '/terms-zh.html' ? 'zh-Hans' : 'en'}>
          {content.map(({ heading, text }) => {
            const Element = heading ? 'h3' : 'p';
            return <Element key={text}>{text}</Element>;
          })}
        </div>
      )}
    </Overlay>
  );
}
