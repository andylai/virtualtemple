import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface OverlayProps {
  /** The card's heading. It also names the dialog for screen readers. */
  title?: string;
  /** `1` for the big first and last screens, `2` (the default) for panels opened from a button. */
  level?: 1 | 2;
  /** Called when the visitor presses Escape. Leave it out for a card that must be answered. */
  onClose?: () => void;
  children: ReactNode;
}

/**
 * A full-screen card shown over the 3D scene (loading, entering, errors, panels). It behaves as a
 * dialog: focus moves into it, Tab stays inside it, Escape closes it when it can be closed, and
 * focus goes back to where it was afterwards (M7-5).
 */
export function Overlay({ title, level = 2, onClose, children }: OverlayProps) {
  const card = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    const opener = document.activeElement;
    card.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onClose !== undefined) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || card.current === null) {
      return;
    }
    const items = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div
      className={onClose === undefined ? 'overlay' : 'overlay overlay-panel'}
      onClick={(event) => {
        // A tap on the dimmed area outside the card closes a panel.
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        className="overlay-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title === undefined ? undefined : headingId}
        ref={card}
        onKeyDown={onKeyDown}
      >
        {title !== undefined && <Heading id={headingId}>{title}</Heading>}
        {children}
      </div>
    </div>
  );
}
