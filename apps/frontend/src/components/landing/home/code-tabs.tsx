'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CodeSample {
  id: string;
  label: string;
  /** File or context shown on the right of the tab bar, e.g. "register.ts". */
  caption: string;
  code: string;
}

/** Tabbed code samples with a copy button. Fully keyboard operable (arrow keys, Home, End). */
export function CodeTabs({ samples }: { samples: readonly CodeSample[] }) {
  const base = useId();
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = samples[active]!;

  function select(index: number) {
    setActive(index);
    setCopied(false);
    tabs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = samples.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? active === last
          ? 0
          : active + 1
        : event.key === 'ArrowLeft'
          ? active === 0
            ? last
            : active - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-foreground/12 bg-[hsl(var(--code-bg))] shadow-[0_1px_0_hsl(0_0%_100%/0.7)_inset,0_40px_90px_-60px_hsl(90_5%_12%/0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-foreground/10 bg-[hsl(var(--code-header))] px-2 sm:px-3">
        <div
          role="tablist"
          aria-label="Code samples"
          className="flex min-w-0 gap-1 overflow-x-auto py-2"
        >
          {samples.map((sample, index) => (
            <button
              key={sample.id}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${sample.id}`}
              aria-selected={index === active}
              aria-controls={`${base}-panel`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={onKeyDown}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                index === active
                  ? 'bg-[hsl(var(--code-bg))] text-foreground shadow-[0_0_0_1px_hsl(var(--foreground)/0.1)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {sample.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            {current.caption}
          </span>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={copied ? 'Copied' : `Copy ${current.label} sample`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[hsl(var(--code-bg))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${current.id}`}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <pre className="min-w-max p-5 font-mono text-[13px] leading-6 sm:p-6">
          <code>{highlight(current.code)}</code>
        </pre>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to the clipboard' : ''}
      </span>
    </div>
  );
}

const KEYWORDS = new Set(['import', 'from', 'const', 'await', 'new', 'export', 'return']);

/**
 * A small highlighter for the fixed samples on this page: comments, strings, keywords and
 * command names. It only wraps text in spans; nothing is ever interpreted as markup.
 */
function highlight(code: string): ReactNode[] {
  const pattern = /((?<=^|\s)\/\/[^\n]*|^#[^\n]*)|('[^'\n]*'|"[^"\n]*")|\b([A-Za-z_]+)\b/gm;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push(code.slice(last, index));
    const [text, comment, string, word] = match;
    if (comment) {
      out.push(
        <span key={key++} className="text-muted-foreground/80">
          {text}
        </span>,
      );
    } else if (string) {
      out.push(
        <span key={key++} className="text-[hsl(85_30%_30%)]">
          {text}
        </span>,
      );
    } else if (word && KEYWORDS.has(word)) {
      out.push(
        <span key={key++} className="text-[hsl(22_85%_42%)]">
          {text}
        </span>,
      );
    } else {
      out.push(text);
    }
    last = index + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
