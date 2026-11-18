'use client';

import { forwardRef, useState } from 'react';
import { EMAIL_CODE_LENGTH } from '@/lib/sign-in-contract';
import { cn } from '@/lib/utils';

/**
 * A 6-digit code field drawn as separate boxes but backed by ONE real input, so paste, SMS/email
 * autofill (`one-time-code`), screen readers and password managers all work as for a normal field.
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
  const active = Math.min(value.length, EMAIL_CODE_LENGTH - 1);

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
    </div>
  );
});
