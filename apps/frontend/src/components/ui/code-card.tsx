'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from 'react';
import { Check, Copy, FileCode2, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CopyStatus = 'idle' | 'copied' | 'failed';

/** Copies text with the Clipboard API; reports failure so the caller can offer manual selection. */
export function useCopyText(resetAfterMs = 2000) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let ok = true;
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
      } catch {
        ok = false;
      }
      setStatus(ok ? 'copied' : 'failed');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus('idle'), resetAfterMs);
      return ok;
    },
    [resetAfterMs],
  );
  return { status, copy };
}

/**
 * The site's copy control, matching the documentation's code cards: a square button that is always
 * visible, with a small "Copied" label next to it after a successful copy.
 */
export function CopyIconButton({
  text,
  label,
  onFailed,
  className,
}: {
  text: string;
  /** What is copied, for screen readers, e.g. "configuration". */
  label: string;
  /** Called when the clipboard is unavailable, e.g. to select the text for manual copying. */
  onFailed?: () => void;
  className?: string;
}) {
  const { status, copy } = useCopyText();
  return (
    <span className={cn('relative inline-flex shrink-0 items-center', className)}>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium shadow-[0_8px_18px_-10px_rgba(20,21,18,0.6)] transition-[opacity,transform] duration-200 motion-reduce:transition-none',
          status === 'idle' ? 'translate-y-0.5 opacity-0' : 'translate-y-0 opacity-100',
          status === 'failed'
            ? 'bg-card text-foreground ring-1 ring-border'
            : 'bg-primary text-primary-foreground',
        )}
      >
        {status === 'failed' ? 'Select to copy' : 'Copied!'}
      </span>
      <button
        type="button"
        onClick={() => {
          void copy(text).then((ok) => {
            if (!ok) onFailed?.();
          });
        }}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/90 bg-[hsl(var(--code-header))] text-foreground/65 transition-[color,border-color,transform] hover:border-[hsl(var(--brand-orange)/0.5)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-95 motion-reduce:transition-none"
      >
        {status === 'copied' ? (
          <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {status === 'copied'
          ? `${label} copied`
          : status === 'failed'
            ? 'Copy is unavailable; select the text to copy it'
            : ''}
      </span>
    </span>
  );
}

const KIND_ICONS: Record<'code' | 'terminal', ComponentType<SVGProps<SVGSVGElement>>> = {
  code: FileCode2,
  terminal: Terminal,
};

/**
 * One code card style for the whole site, matching the documentation: a paper surface, a header
 * with the file or command name, an always-visible copy button and horizontally scrollable code.
 */
export function CodeCard({
  title,
  code,
  kind = 'code',
  wrap = false,
  copyLabel,
  footer,
  className,
}: {
  title: string;
  code: string;
  kind?: 'code' | 'terminal';
  /** Wrap long lines instead of scrolling (for keys and URLs). */
  wrap?: boolean;
  copyLabel?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const Icon = KIND_ICONS[kind];
  const selectCode = () => {
    const pre = preRef.current;
    const selection = window.getSelection();
    if (!pre || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(pre);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  return (
    <figure
      className={cn(
        'code-card m-0 min-w-0 overflow-hidden rounded-[14px] border border-border/80 bg-[hsl(var(--code-bg))] shadow-[0_18px_40px_-32px_rgba(20,21,18,0.5)]',
        className,
      )}
    >
      <figcaption className="flex h-11 items-center justify-between gap-3 border-b border-border/70 bg-[hsl(var(--code-header))] pl-4 pr-1.5">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate font-mono">{title}</span>
        </span>
        <CopyIconButton text={code} label={copyLabel ?? title} onFailed={selectCode} />
      </figcaption>
      <pre
        ref={preRef}
        tabIndex={0}
        role="region"
        aria-label={title}
        className={cn(
          'max-w-full px-4 py-3.5 font-mono text-[12.5px] leading-6 text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
          wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'mobile-scroll overflow-x-auto',
        )}
      >
        <code>{code}</code>
      </pre>
      {footer}
    </figure>
  );
}
