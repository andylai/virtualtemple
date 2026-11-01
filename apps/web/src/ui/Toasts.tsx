import { DEFAULT_CONFIG, nicknameText } from '@temple/shared';
import { flagshipManifest } from '@temple/shared/flagship';
import { useEffect } from 'react';
import { useLanguage, useT } from '../i18n/I18nProvider';
import type { Toast } from '../net/hallState';
import { RITUAL_TOAST_KEYS } from './ritualLabels';

const MS_PER_SECOND = 1000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const t = useT();
  const language = useLanguage();
  useEffect(() => {
    const timer = setTimeout(
      () => onDismiss(toast.id),
      DEFAULT_CONFIG.ui.toastSeconds * MS_PER_SECOND,
    );
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);
  const name = nicknameText(flagshipManifest.nicknames, toast.nickname, language);
  return <div className="toast">{t(RITUAL_TOAST_KEYS[toast.ritualId], { name })}</div>;
}

/** What others are doing, as short messages that fade away (FR-20 to FR-22). Screen readers hear them. */
export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
