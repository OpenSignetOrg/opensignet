'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccountPlanError, fetchAccountPlan, planName, type AccountPlan } from '@/lib/account-plan';
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

  const free = plan?.plan === 'included';

  return (
    <section
      aria-labelledby="dashboard-plan"
      className="premium-surface mb-8 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground"
          aria-hidden
        >
          <CreditCard className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 id="dashboard-plan" className="text-sm text-muted-foreground">
            Your plan
          </h2>
          {state === 'loading' ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Loading your plan…
            </p>
          ) : state === 'error' || !plan ? (
            <p className="mt-1 text-sm text-muted-foreground" role="alert">
              We couldn’t load your plan right now.
            </p>
          ) : (
            <>
              <p className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{planName(plan.plan, plan.sku)}</span>
                {plan.status === 'past_due' ? (
                  <Badge variant="destructive">Payment due</Badge>
                ) : plan.cancelAtPeriodEnd ? (
                  <Badge variant="outline">Ends at period end</Badge>
                ) : null}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {free
                  ? 'Upgrade for more email, API keys, DNS records and aliases across every identity.'
                  : plan.currentPeriodEnd
                    ? `${plan.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${formatDate(plan.currentPeriodEnd)}${plan.period ? `, billed ${plan.period}` : ''}. Covers every identity in your account.`
                    : 'Covers every identity in your account.'}
              </p>
            </>
          )}
        </div>
      </div>
      {state === 'error' ? (
        <Button
          variant="outline"
          className="h-10 w-full sm:w-auto"
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
      ) : (
        <Button asChild variant={free ? 'default' : 'outline'} className="h-10 w-full sm:w-auto">
          <Link href="/pricing">
            {free ? 'Upgrade' : 'Change plan'}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      )}
    </section>
  );
}
