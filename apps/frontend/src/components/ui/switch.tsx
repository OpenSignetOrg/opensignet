'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The platform's on/off switch: a quiet track, a lifted thumb that glides across, and the brand
 * green when on. Keyboard (Space/Enter), focus ring, pressed and disabled states included.
 */
const Switch = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }
>(({ className, checked = false, onCheckedChange, ...props }, ref) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      ref={ref}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'group peer relative inline-flex h-6 w-[42px] shrink-0 cursor-pointer items-center rounded-full p-[3px] outline-none transition-[background-color,box-shadow] duration-200 ease-out',
        'focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'bg-[hsl(143_38%_33%)] shadow-[inset_0_1px_2px_hsl(143_40%_14%/0.35)] hover:bg-[hsl(143_38%_30%)]'
          : 'bg-[hsl(48_9%_80%)] shadow-[inset_0_1px_2px_hsl(90_5%_12%/0.18)] hover:bg-[hsl(48_9%_76%)]',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_hsl(90_5%_12%/0.25),0_2px_6px_hsl(90_5%_12%/0.12)] transition-[transform,width] duration-200 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none',
          'group-active:w-[21px]',
          checked ? 'translate-x-[18px] group-active:translate-x-[15px]' : 'translate-x-0',
        )}
      />
    </button>
  );
});
Switch.displayName = 'Switch';

export { Switch };
