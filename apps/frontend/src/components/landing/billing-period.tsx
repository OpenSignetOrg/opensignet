'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import { Button } from '@/components/ui/button';
import { fetchAccountPlan, type AccountPlan } from '@/lib/account-plan';
import { cn } from '@/lib/utils';

export type BillingPeriod = 'monthly' | 'yearly';

const BillingPeriodContext = createContext<{
  period: BillingPeriod;
  setPeriod: (period: BillingPeriod) => void;
}>({ period: 'monthly', setPeriod: () => {} });

/** The signed-in account's plan, or null for visitors (and until it loads). */
const CurrentPlanContext = createContext<AccountPlan | null>(null);

/**
 * Shares the Monthly / Yearly choice between the switch and every plan price (monthly first, or
 * the current plan's period for a signed-in account), and the account's current plan.
 */
export function BillingPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [current, setCurrent] = useState<AccountPlan | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchAccountPlan(controller.signal).then(
      (plan) => {
        setCurrent(plan);
        if (plan.period) setPeriod(plan.period);
      },
      // Signed out, or unavailable: the page shows the plans as for any visitor.
      () => undefined,
    );
    return () => controller.abort();
  }, []);
  return (
    <BillingPeriodContext.Provider value={{ period, setPeriod }}>
      <CurrentPlanContext.Provider value={current}>{children}</CurrentPlanContext.Provider>
    </BillingPeriodContext.Provider>
  );
}

/** The SKU a plan card sells: null for Free, `plus`…`max`, or `enterprise-<emails>`. */
type CardSku = string | null;

function currentSku(plan: AccountPlan): CardSku {
  return plan.plan === 'included' ? null : (plan.sku ?? plan.plan);
}

/** Price per day in USDC atomic units, to tell an upgrade from a downgrade. */
function dailyRate(sku: string, period: BillingPeriod): number {
  const enterprise = ENTERPRISE_PLAN_OFFERS.find((offer) => offer.sku === sku);
  const key = sku as keyof typeof SERVICE_PLAN_CATALOG;
  const monthly =
    enterprise?.monthlyPriceUsdcAtomic ?? SERVICE_PLAN_CATALOG[key]?.monthlyPriceUsdcAtomic ?? 0n;
  const yearly =
    enterprise?.yearlyPriceUsdcAtomic ?? SERVICE_PLAN_CATALOG[key]?.yearlyPriceUsdcAtomic ?? 0n;
  return period === 'monthly' ? Number(monthly) / 30 : Number(yearly) / 365;
}

/** Whether a plan card is the account's current plan (any period). */
export function useIsCurrentPlan(sku: CardSku | 'enterprise'): boolean {
  const current = useContext(CurrentPlanContext);
  if (!current) return false;
  if (sku === 'enterprise') return current.plan === 'enterprise';
  return currentSku(current) === sku;
}

/** A small pill in the corner of the current plan's card. */
export function CurrentPlanBadge({ sku }: { sku: CardSku | 'enterprise' }) {
  if (!useIsCurrentPlan(sku)) return null;
  return (
    <span className="absolute right-5 top-5 inline-flex h-7 items-center gap-1.5 rounded-full bg-[hsl(143_38%_94%)] py-1 pl-1 pr-3 text-[12px] font-semibold tracking-[0.01em] text-[hsl(143_45%_22%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_hsl(143_40%_20%/0.1)] ring-1 ring-inset ring-[hsl(143_30%_76%)] sm:right-6 sm:top-6">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(143_45%_32%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      Current plan
    </span>
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
  const current = useContext(CurrentPlanContext);
  const checkout = plan
    ? `/checkout?${new URLSearchParams({ plan, period }).toString()}`
    : '/dashboard';

  // What this card means for the signed-in account; visitors see the plain offer.
  let action: { href: string; label: string; primary: boolean } | 'current' = {
    href: checkout,
    label,
    primary: plan !== null,
  };
  if (current) {
    const mine = currentSku(current);
    if (plan === null) {
      action =
        mine === null
          ? 'current'
          : { href: '/dashboard/billing', label: 'Manage your plan', primary: false };
    } else if (mine === plan) {
      action =
        current.period === period
          ? 'current'
          : { href: checkout, label: `Switch to ${period}`, primary: false };
    } else if (mine !== null) {
      const higher =
        dailyRate(plan, period) > dailyRate(mine, (current.period ?? 'monthly') as BillingPeriod);
      action = higher
        ? { href: checkout, label: 'Upgrade', primary: true }
        : { href: checkout, label: 'Switch at renewal', primary: false };
    }
  }

  if (action === 'current') {
    return (
      <div className="mt-auto pt-6">
        <Button
          variant="outline"
          disabled
          className="h-11 w-full text-[15px] disabled:opacity-100 disabled:text-muted-foreground"
        >
          <Check className="h-4 w-4" aria-hidden />
          Your current plan
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-auto pt-6">
      <Button
        asChild
        variant={action.primary ? 'default' : 'outline'}
        className="group/cta h-11 w-full text-[15px]"
      >
        <Link href={action.href}>
          {action.label}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
        </Link>
      </Button>
    </div>
  );
}
