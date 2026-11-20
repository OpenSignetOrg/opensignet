'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AutoRenewControl } from '@/components/billing/auto-renew-control';
import { toast } from 'sonner';
import {
  AccountPlanError,
  cancelScheduledChange,
  fetchAccountPlan,
  fetchPlanUsage,
  planName,
  type AccountPlan,
  type PlanUsage,
} from '@/lib/account-plan';
import { cn, formatDate } from '@/lib/utils';

/**
 * The account's plan on the dashboard, with the way to upgrade or change it. Plans cover the whole
 * account, so this is the one place (with the pricing page) where they are bought.
 */
export function PlanSummary({ sample }: { sample?: AccountPlan | null }) {
  const [plan, setPlan] = useState<AccountPlan | null>(sample ?? null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(sample ? 'ready' : 'loading');
  const [attempt, setAttempt] = useState(0);
  const [usage, setUsage] = useState<PlanUsage | null>(null);

  // Usage is a bonus on top of the limits: if it can't load, the limits still show.
  useEffect(() => {
    if (sample) return;
    const controller = new AbortController();
    fetchPlanUsage(controller.signal)
      .then(setUsage)
      .catch(() => undefined);
    return () => controller.abort();
  }, [sample, attempt, plan?.sku]);

  useEffect(() => {
    if (sample) return;
    const controller = new AbortController();
    setState('loading');
    fetchAccountPlan(controller.signal)
      .then((value) => {
        setPlan(value);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // Signed out is handled by the page itself; only a real failure shows here.
        if (error instanceof AccountPlanError && error.kind === 'signed-out') return;
        setState('error');
      });
    return () => controller.abort();
  }, [sample, attempt]);

  const [keeping, setKeeping] = useState(false);
  async function keepCurrent() {
    setKeeping(true);
    try {
      setPlan(await cancelScheduledChange());
      toast.success('Your plan stays the same', {
        description: 'The scheduled change is cancelled.',
      });
    } catch {
      toast.error('Couldn’t cancel the change', {
        description: 'Nothing has changed. Try again in a moment.',
      });
    } finally {
      setKeeping(false);
    }
  }

  const free = plan?.plan === 'included';
  const limits = plan ? SERVICE_PLAN_CATALOG[plan.plan].limits : null;
  const emails = plan
    ? plan.plan === 'enterprise'
      ? (ENTERPRISE_PLAN_OFFERS.find((offer) => offer.sku === plan.sku)?.monthlyEmails ??
        SERVICE_PLAN_CATALOG.enterprise.limits.monthlyEmails)
      : (limits?.monthlyEmails ?? 0)
    : 0;
  const identities = plan
    ? plan.plan === 'enterprise'
      ? (ENTERPRISE_PLAN_OFFERS.find((offer) => offer.sku === plan.sku)?.identities ??
        SERVICE_PLAN_CATALOG.enterprise.limits.identities)
      : (limits?.identities ?? 0)
    : 0;

  return (
    <section aria-labelledby="dashboard-plan" className="console-card mb-8 overflow-hidden">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2 id="dashboard-plan" className="text-[12.5px] font-medium text-muted-foreground">
            Your plan
          </h2>
          {state === 'loading' ? (
            <div
              className="mt-1.5 flex flex-col gap-2"
              role="status"
              aria-label="Loading your plan"
            >
              <span className="h-6 w-24 animate-pulse rounded-md bg-foreground/[0.06] motion-reduce:animate-none" />
              <span className="h-4 w-64 max-w-full animate-pulse rounded bg-foreground/[0.05] motion-reduce:animate-none" />
            </div>
          ) : state === 'error' || !plan ? (
            <p className="mt-1 text-[14px] text-muted-foreground" role="alert">
              We couldn’t load your plan right now.
            </p>
          ) : (
            <>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">
                  {planName(plan.plan, plan.sku)}
                </span>
                {plan.status === 'past_due' ? (
                  <Badge variant="destructive">Payment due</Badge>
                ) : plan.cancelAtPeriodEnd && !free ? (
                  <Badge variant="outline">Ends at period end</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-[13.5px] leading-5 text-muted-foreground">
                {free
                  ? 'Every identity in your account gets these limits. Upgrade for more of each.'
                  : plan.currentPeriodEnd
                    ? `${plan.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${formatDate(plan.currentPeriodEnd)}${plan.period ? `, billed ${plan.period}` : ''}. Every identity gets these limits.`
                    : 'Every identity in your account gets these limits.'}
              </p>
              {plan.scheduled ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-[12.5px]">
                  <span className="text-foreground/85">
                    Changes to{' '}
                    <strong className="font-semibold">
                      {planName(
                        plan.scheduled.sku.split('-')[0] as AccountPlan['plan'],
                        plan.scheduled.sku,
                      )}
                    </strong>
                    , billed {plan.scheduled.period}, on {formatDate(plan.scheduled.startsAt)}.
                  </span>
                  <button
                    type="button"
                    disabled={keeping}
                    onClick={() => void keepCurrent()}
                    className="font-medium underline-offset-4 hover:underline disabled:opacity-60"
                  >
                    Keep {planName(plan.plan, plan.sku)}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
        {state === 'error' ? (
          <Button
            variant="outline"
            className="h-10 w-full shrink-0 rounded-lg sm:w-auto"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
        ) : (
          <Button
            asChild
            variant={free ? 'default' : 'outline'}
            className="h-10 w-full shrink-0 rounded-lg sm:w-auto"
          >
            <Link href="/pricing">
              {free ? 'Upgrade' : 'Change plan'}
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        )}
      </div>
      {plan && limits && state === 'ready' ? (
        <div className="grid border-t border-border/60 lg:grid-cols-[2fr_3fr]">
          <LimitGroup
            title="Your account"
            items={[
              {
                label: 'Email a month',
                limit: emails,
                used: usage?.monthlyEmails.used ?? null,
                note: usage
                  ? `Resets ${new Date(usage.monthlyEmails.resetsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                  : 'Shared by every identity',
              },
              {
                label: 'Identities',
                limit: identities,
                used: usage?.identities.used ?? null,
              },
            ]}
          />
          <LimitGroup
            title="Each identity"
            className="border-t border-border/60 lg:border-l lg:border-t-0"
            items={[
              {
                label: 'Email aliases',
                limit: limits.emailAliases,
                highest: usage?.emailAliases.highest ?? null,
                note: 'For the inbox',
              },
              { label: 'API keys', limit: limits.apiKeys, highest: usage?.apiKeys.highest ?? null },
              {
                label: 'DNS records',
                limit: limits.dnsRecords,
                highest: usage?.dnsRecords.highest ?? null,
              },
            ]}
          />
        </div>
      ) : null}
      {plan && state === 'ready' && !sample ? (
        <AutoRenewControl plan={plan} onChange={setPlan} />
      ) : null}
    </section>
  );
}

type LimitItem = {
  label: string;
  limit: number;
  /** Used across the account; null when not counted. */
  used?: number | null;
  /** The fullest identity, for limits that apply to each identity. */
  highest?: number | null;
  note?: string;
};

/**
 * One group of plan limits: a small heading over evenly spaced figures. Account limits show what
 * is used and left with a meter; per-identity limits show the fullest identity.
 */
function LimitGroup({
  title,
  items,
  className,
}: {
  title: string;
  items: ReadonlyArray<LimitItem>;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn('px-5 py-4 sm:px-6', className)}>
      <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/90">
        {title}
      </h3>
      <dl
        className="mt-2.5 grid gap-x-6 gap-y-3"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <LimitFigure key={item.label} item={item} />
        ))}
      </dl>
    </section>
  );
}

function LimitFigure({ item }: { item: LimitItem }) {
  const figure = (value: number) => value.toLocaleString('en-US');
  const counted = typeof item.used === 'number';
  const share = counted && item.limit > 0 ? Math.min(1, (item.used ?? 0) / item.limit) : 0;
  const full = counted && (item.used ?? 0) >= item.limit;
  const near = counted && !full && share >= 0.8;
  const left = counted ? Math.max(0, item.limit - (item.used ?? 0)) : 0;
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12px] text-muted-foreground">{item.label}</dt>
      <dd className="mt-0.5 min-w-0">
        {counted ? (
          <>
            <span className="text-[17px] font-semibold tabular-nums">{figure(item.used ?? 0)}</span>
            <span className="text-[13px] tabular-nums text-muted-foreground">
              {' '}
              of {figure(item.limit)}
            </span>
            <div
              className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/[0.07]"
              role="meter"
              aria-label={`${item.label} used`}
              aria-valuemin={0}
              aria-valuemax={item.limit}
              aria-valuenow={item.used ?? 0}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
                  full
                    ? 'bg-[hsl(4_65%_48%)]'
                    : near
                      ? 'bg-[hsl(32_85%_48%)]'
                      : 'bg-[hsl(143_38%_36%)]',
                )}
                style={{ width: `${Math.max(item.used ? 3 : 0, share * 100)}%` }}
              />
            </div>
            <div
              className={cn(
                'mt-1 truncate text-[11.5px]',
                full ? 'font-medium text-[hsl(4_60%_42%)]' : 'text-muted-foreground',
              )}
            >
              {full ? 'All in use' : `${figure(left)} left`}
              {item.note ? ` · ${item.note}` : ''}
            </div>
          </>
        ) : (
          <>
            <span className="text-[17px] font-semibold tabular-nums">{figure(item.limit)}</span>
            {typeof item.highest === 'number' ? (
              <div className="mt-1 truncate text-[11.5px] text-muted-foreground">
                Fullest uses {figure(item.highest)}
              </div>
            ) : item.note ? (
              <div className="mt-1 truncate text-[11.5px] text-muted-foreground">{item.note}</div>
            ) : null}
          </>
        )}
      </dd>
    </div>
  );
}
