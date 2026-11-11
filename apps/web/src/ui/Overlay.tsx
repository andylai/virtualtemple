import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps keyboard focus inside the active dialog when Tab crosses either edge. */
function wrapTabFocus(event: KeyboardEvent<HTMLDivElement>, card: HTMLDivElement): void {
  const items = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

interface OverlayProps {
  /** The card's heading. It also names the dialog for screen readers. */
  title?: string;
  /** `1` for the big first and last screens, `2` (the default) for panels opened from a button. */
  level?: 1 | 2;
  /** Lets a screen adjust its layout while keeping the dialog's focus behavior. */
  className?: string;
  /** Decorative content shown above the dialog heading. */
  beforeTitle?: ReactNode;
  /** Called when the visitor presses Escape. Leave it out for a card that must be answered. */
  onClose?: () => void;
  children: ReactNode;
}

/**
 * A full-screen card shown over the 3D scene (loading, entering, errors, panels). It behaves as a
 * dialog: focus moves into it, Tab stays inside it, Escape closes it when it can be closed, and
 * focus goes back to where it was afterwards (M7-5).
 */
export function Overlay({
  title,
  level = 2,
  className,
  beforeTitle,
  onClose,
  children,
}: OverlayProps) {
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
    if (event.key === 'Tab' && card.current !== null) {
      wrapTabFocus(event, card.current);
    }
  };

  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div
      className={['overlay', onClose && 'overlay-panel', className].filter(Boolean).join(' ')}
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
        {beforeTitle}
        {title !== undefined && <Heading id={headingId}>{title}</Heading>}
        {children}
      </div>
    </div>
  );
}
