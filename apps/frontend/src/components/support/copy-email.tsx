'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CopyEmailButton({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(email);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2400);
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]',
          status === 'copied'
            ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800'
            : status === 'failed'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-input bg-card/80 text-foreground hover:border-[hsl(var(--brand-orange)/0.45)] hover:bg-accent/70',
        )}
      >
        {status === 'copied' ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy unavailable' : 'Copy address'}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'copied'
          ? 'Support email address copied.'
          : status === 'failed'
            ? 'Copy is unavailable here. Select the address and copy it manually.'
            : ''}
      </span>
    </>
  );
}
