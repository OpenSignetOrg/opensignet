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
  planName,
  type AccountPlan,
} from '@/lib/account-plan';
import { formatDate } from '@/lib/utils';

/**
 * The account's plan on the dashboard, with the way to upgrade or change it. Plans cover the whole
 * account, so this is the one place (with the pricing page) where they are bought.
 */
export function PlanSummary({ sample }: { sample?: AccountPlan | null }) {
  const [plan, setPlan] = useState<AccountPlan | null>(sample ?? null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(sample ? 'ready' : 'loading');
  const [attempt, setAttempt] = useState(0);

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
        <dl className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60 lg:grid-cols-4">
          {(
            [
              ['Email a month', emails.toLocaleString('en-US')],
              ['API keys', String(limits.apiKeys)],
              ['DNS records', String(limits.dnsRecords)],
              ['Email aliases', limits.emailAliases ? String(limits.emailAliases) : 'None'],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="bg-[hsl(var(--console-surface))] px-5 py-3.5 sm:px-6">
              <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-[16px] font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {plan && state === 'ready' && !sample ? (
        <AutoRenewControl plan={plan} onChange={setPlan} />
      ) : null}
    </section>
  );
}
