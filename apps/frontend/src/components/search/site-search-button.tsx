'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type DialogComponent = ComponentType<{ open: boolean; onClose: () => void }>;
type DialogModule = typeof import('./site-search-dialog');

let dialogModule: Promise<DialogModule> | null = null;

/** The search window and its index load only when someone is about to search. */
function loadDialog(): Promise<DialogModule> {
  dialogModule ??= import('./site-search-dialog').catch((error: unknown) => {
    dialogModule = null;
    throw error;
  });
  return dialogModule;
}

function prefetch() {
  void loadDialog()
    .then((module) => module.preloadSiteSearch())
    .catch(() => undefined);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Header search button. Also opens with Ctrl K (⌘ K on Mac) or "/" when not typing. */
export function SiteSearchButton({ className }: { className?: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [Dialog, setDialog] = useState<DialogComponent | null>(null);
  const [open, setOpen] = useState(false);
  const [shortcut, setShortcut] = useState('Ctrl K');
  const [failed, setFailed] = useState(false);

  const openSearch = useCallback(() => {
    loadDialog().then(
      (module) => {
        setFailed(false);
        setDialog(() => module.SiteSearchDialog);
        setOpen(true);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut('⌘ K');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const commandK =
        (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k';
      const slash =
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target);
      if (!commandK && !slash) return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      openSearch();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openSearch]);

  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => setFailed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [failed]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={openSearch}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K /"
        title={`Search (${shortcut})`}
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/80 bg-card/70 text-foreground/80 shadow-sm transition hover:border-[hsl(var(--brand-orange)/0.45)] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:bg-accent',
          className,
        )}
      >
        <Search className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </button>
      {Dialog ? (
        <Dialog
          open={open}
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      {failed ? (
        <p
          role="status"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-5 text-foreground shadow-[0_18px_40px_-24px_rgba(20,21,18,0.55)]"
        >
          Search could not load. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}
