'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one modal dialog: portal, dimmed blurred backdrop, Escape and backdrop click to close (unless
 * busy), focus moved in and restored on close, focus kept inside while open. Bottom sheet on phones,
 * centred card from 640px.
 */
export function Dialog({
  title,
  description,
  onClose,
  busy = false,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  /** While an action runs the dialog cannot be dismissed. */
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  }, [onClose, busy]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>(
      '[autofocus], input, button:not([data-dialog-close])',
    );
    (first ?? node)?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const focusable = [
        ...node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const firstItem = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem?.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="opensignet-wallet-backdrop fixed inset-0 z-[85] flex items-end justify-center px-3 pb-3 pt-10 sm:items-center sm:px-6 sm:py-6">
      <div
        className="absolute inset-0"
        aria-hidden
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[calc(100dvh-3.25rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover shadow-[0_28px_70px_-34px_rgba(20,21,18,0.6)] outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            data-dialog-close
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1.5 -mt-1 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
