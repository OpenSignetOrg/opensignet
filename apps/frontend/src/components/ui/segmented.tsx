'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Shown as the option's tooltip and to assistive technology when it can't be chosen. */
  disabledReason?: string;
};

/**
 * A small segmented choice (a radio group drawn as one control): arrow keys move between options,
 * the chosen one is lifted. Disabled options stay visible and say why.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const usable = options.filter((option) => !option.disabledReason);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step || usable.length < 2) return;
    event.preventDefault();
    const at = usable.findIndex((option) => option.value === value);
    const next = usable[(at + step + usable.length) % usable.length];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full items-center rounded-[10px] border border-border/80 bg-secondary/60 p-[3px]',
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const off = disabled || Boolean(option.disabledReason);
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={off || undefined}
            title={option.disabledReason}
            tabIndex={selected ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => {
              if (!off && !selected) onChange(option.value);
            }}
            className={cn(
              'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 sm:flex-none text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              selected
                ? 'bg-card text-foreground shadow-[0_1px_2px_hsl(90_5%_12%/0.12),0_0_0_1px_hsl(90_5%_12%/0.06)]'
                : 'text-muted-foreground hover:text-foreground',
              off && !selected && 'cursor-not-allowed opacity-55 hover:text-muted-foreground',
              disabled && selected && 'opacity-70',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
