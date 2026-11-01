import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nProvider';

/** How long "Link copied" stays on the button. */
const FEEDBACK_MS = 2000;

/** Copies a link to the hall the visitor is in, so a friend lands in the same hall (FR-10). */
export function InviteButton({ hall }: { hall: number }) {
  const t = useT();
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (feedback === null) {
      return undefined;
    }
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const copy = async () => {
    const link = `${window.location.origin}/?hall=${hall}`;
    try {
      await navigator.clipboard.writeText(link);
      setFeedback('copied');
    } catch {
      setFeedback('failed');
    }
  };

  return (
    <button type="button" onClick={() => void copy()}>
      {feedback === 'copied' ? t('invite.copied') : t('invite.button')}
      {feedback === 'failed' && <span role="alert"> — {t('invite.failed')}</span>}
    </button>
  );
}
