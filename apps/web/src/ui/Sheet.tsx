import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** How long the closing slide runs before the sheet is removed. Matches --motion. */
export const SHEET_CLOSE_MS = 180;

/**
 * A modal panel for a short form: slides up from the bottom on a phone, sits in
 * the middle of the screen on a desktop. Escape or a tap outside closes it.
 */
export function Sheet({ open, title, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Stays mounted for one beat after `open` goes false so the slide down can play.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), SHEET_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open && !mounted) return null;
  return createPortal(
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`sheet${open ? '' : ' is-closing'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={open ? undefined : true}
        tabIndex={-1}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="quiet" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
