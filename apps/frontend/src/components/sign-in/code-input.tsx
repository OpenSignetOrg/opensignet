'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { EMAIL_CODE_LENGTH } from '@/lib/sign-in-contract';
import { cn } from '@/lib/utils';

/** The first run of exactly six digits in pasted text ("Your code is 123 456" works too). */
function codeFrom(text: string): string | null {
  const exact = (source: string) =>
    source.match(/\d+/g)?.find((run) => run.length === EMAIL_CODE_LENGTH) ?? null;
  // A code on its own first; then one split by spaces or dashes ("123 456", "123-456").
  return exact(text) ?? exact(text.replace(/(\d)[\s-]+(?=\d)/g, '$1'));
}

/**
 * A 6-digit code field drawn as separate boxes but backed by ONE real input, so paste, SMS/email
 * autofill (`one-time-code`), screen readers and password managers all work as for a normal field.
 * A Paste button fills it from the clipboard in one tap where the browser allows reading it.
 */
export const CodeInput = forwardRef<
  HTMLInputElement,
  {
    id: string;
    value: string;
    onChange: (value: string) => void;
    onComplete: (value: string) => void;
    disabled?: boolean;
    invalid?: boolean;
    describedBy?: string;
  }
>(function CodeInput({ id, value, onChange, onComplete, disabled, invalid, describedBy }, ref) {
  const [focused, setFocused] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);
  const active = Math.min(value.length, EMAIL_CODE_LENGTH - 1);

  useEffect(() => {
    setCanPaste(
      typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function',
    );
    return () => window.clearTimeout(hintTimer.current);
  }, []);

  function hint(message: string) {
    setPasteHint(message);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setPasteHint(null), 4000);
  }

  async function paste() {
    try {
      const code = codeFrom(await navigator.clipboard.readText());
      if (!code) {
        hint('No 6-digit code on your clipboard. Copy the code from the email first.');
        return;
      }
      setPasteHint(null);
      onChange(code);
      onComplete(code);
    } catch {
      hint('Your browser didn’t allow pasting here. Use Ctrl+V, or long-press the boxes.');
    }
  }

  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
          onChange(digits);
          if (digits.length === EMAIL_CODE_LENGTH) onComplete(digits);
        }}
        onPaste={(event) => {
          // Pick the code out of pasted text, so "Your code is 123 456" fills the boxes correctly.
          const code = codeFrom(event.clipboardData.getData('text'));
          if (!code) return;
          event.preventDefault();
          setPasteHint(null);
          onChange(code);
          onComplete(code);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={EMAIL_CODE_LENGTH}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent disabled:cursor-not-allowed"
      />
      <div className="grid grid-cols-6 gap-2 sm:gap-2.5" aria-hidden>
        {Array.from({ length: EMAIL_CODE_LENGTH }, (_, index) => {
          const digit = value[index] ?? '';
          const current = focused && !disabled && index === active;
          return (
            <span
              key={index}
              className={cn(
                'relative flex h-12 items-center justify-center rounded-lg border bg-card font-mono text-xl font-semibold tabular-nums text-foreground transition-[border-color,box-shadow] sm:h-14 sm:text-2xl',
                invalid
                  ? 'border-destructive/60'
                  : current
                    ? 'border-foreground/45 shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]'
                    : 'border-border/90',
                disabled && 'opacity-60',
              )}
            >
              {digit}
              {current && !digit && (
                <span className="h-6 w-px animate-pulse bg-foreground/70 motion-reduce:animate-none" />
              )}
            </span>
          );
        })}
      </div>
      {canPaste && !disabled ? (
        <div className="mt-2.5 flex min-h-8 items-center justify-end gap-3">
          <p
            aria-live="polite"
            className="min-w-0 flex-1 text-[12.5px] leading-5 text-muted-foreground"
          >
            {pasteHint}
          </p>
          <button
            type="button"
            onClick={() => void paste()}
            className="group relative z-20 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/90 bg-card px-3 text-[13px] font-medium text-foreground shadow-[0_1px_2px_hsl(90_5%_12%/0.08),inset_0_1px_0_hsl(0_0%_100%/0.9)] transition-[background-color,box-shadow,transform] duration-150 hover:bg-background hover:shadow-[0_2px_6px_-2px_hsl(90_5%_12%/0.18),inset_0_1px_0_hsl(0_0%_100%/0.9)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none"
          >
            <ClipboardPaste
              className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
              strokeWidth={1.75}
              aria-hidden
            />
            Paste code
          </button>
        </div>
      ) : null}
    </div>
  );
});
