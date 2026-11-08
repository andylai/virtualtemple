import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n/I18nProvider';
import { HallIcon } from './HallIcon';

/** A disclosure keeps secondary actions together and lets their existing dialogs manage focus. */
export function MoreMenu({ children }: { children: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div
      className="more-menu"
      ref={wrapper}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        className="more-toggle"
        type="button"
        ref={toggle}
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <HallIcon name="more" />
        {t('menu.more')}
      </button>
      <div className="more-actions" id={panelId} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
