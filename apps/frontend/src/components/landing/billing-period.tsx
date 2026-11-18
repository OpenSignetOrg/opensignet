'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type BillingPeriod = 'monthly' | 'yearly';

const BillingPeriodContext = createContext<{
  period: BillingPeriod;
  setPeriod: (period: BillingPeriod) => void;
}>({ period: 'monthly', setPeriod: () => {} });

/** Shares the Monthly / Yearly choice between the switch and every plan price. Monthly first. */
export function BillingPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  return (
    <BillingPeriodContext.Provider value={{ period, setPeriod }}>
      {children}
    </BillingPeriodContext.Provider>
  );
}

export function useBillingPeriod() {
  return useContext(BillingPeriodContext);
}

const OPTIONS: ReadonlyArray<{ value: BillingPeriod; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

/** Segmented Monthly / Yearly switch. */
export function BillingPeriodToggle({ className }: { className?: string }) {
  const { period, setPeriod } = useBillingPeriod();
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg border border-border/80 bg-secondary/60 p-1',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === period;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPeriod(option.value)}
            className={cn(
              'inline-flex h-9 min-w-[5.5rem] items-center justify-center rounded-md px-4 text-sm font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
              selected
                ? 'bg-primary text-primary-foreground shadow-[0_6px_14px_-8px_rgba(20,21,18,0.6)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A plan price in the selected period, e.g. "$4.90/month" or "$58.80/year". */
export function PlanPrice({
  monthly,
  yearly,
  className,
}: {
  monthly: string;
  yearly: string;
  className?: string;
}) {
  const { period } = useBillingPeriod();
  return (
    <div className={className} aria-live="polite">
      {period === 'monthly' ? `${monthly}/month` : `${yearly}/year`}
    </div>
  );
}

/**
 * The action at the bottom of a plan card. The Free plan opens the dashboard; a paid plan opens
 * checkout with the chosen plan and billing period.
 */
export function PlanCta({ plan, label }: { plan: string | null; label: string }) {
  const { period } = useBillingPeriod();
  const href = plan
    ? `/checkout?${new URLSearchParams({ plan, period }).toString()}`
    : '/dashboard';
  return (
    <div className="mt-auto pt-6">
      <Button
        asChild
        variant={plan ? 'default' : 'outline'}
        className="group/cta h-11 w-full text-[15px]"
      >
        <Link href={href}>
          {label}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
        </Link>
      </Button>
    </div>
  );
}
