'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CreditCard, Wallet, Zap } from 'lucide-react';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import { PlanSummary } from '@/components/dashboard/plan-summary';
import { fetchAccountPlan, planName, type AccountPlan } from '@/lib/account-plan';
import { PageHeader } from './identity-bits';

/** Billing: the account's plan (with automatic renewal), what it includes, and how payment works. */
export function ConsoleBilling() {
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // The plan card above shows its own error; this section simply waits for the plan.
    fetchAccountPlan(controller.signal).then(setPlan, () => undefined);
    return () => controller.abort();
  }, []);

  const limits = plan ? SERVICE_PLAN_CATALOG[plan.plan].limits : null;
  const enterpriseEmails =
    plan?.plan === 'enterprise'
      ? ENTERPRISE_PLAN_OFFERS.find((offer) => offer.sku === plan.sku)?.monthlyEmails
      : undefined;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan covers your whole account. Every identity in it gets the limits below."
        actions={
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border/90 bg-card px-3 text-[13.5px] font-medium shadow-[0_1px_2px_hsl(90_5%_12%/0.06)] transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Compare plans
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          </Link>
        }
      />

      <PlanSummary />

      <section aria-labelledby="billing-limits" className="console-card mb-8 overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4 sm:px-6">
          <h2 id="billing-limits" className="text-[15px] font-semibold">
            {plan ? `Included with ${planName(plan.plan, plan.sku)}` : 'Included with your plan'}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            For each identity in your account.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-border/60 lg:grid-cols-4">
          {[
            [
              'Email a month',
              limits ? (enterpriseEmails ?? limits.monthlyEmails).toLocaleString('en-US') : null,
              'sent and received',
            ],
            ['API keys', limits ? String(limits.apiKeys) : null, null],
            ['DNS records', limits ? String(limits.dnsRecords) : null, null],
            [
              'Email aliases',
              limits ? (limits.emailAliases ? String(limits.emailAliases) : 'None') : null,
              null,
            ],
          ].map(([label, value, hint]) => (
            <div key={label} className="bg-[hsl(var(--console-surface))] px-5 py-4 sm:px-6">
              <dt className="text-[12.5px] font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-1.5 text-[20px] font-semibold tabular-nums tracking-[-0.01em]">
                {value ?? (
                  <span className="inline-block h-5 w-12 animate-pulse rounded bg-foreground/[0.06] align-middle motion-reduce:animate-none">
                    <span className="sr-only">Loading</span>
                  </span>
                )}
              </dd>
              {hint ? <dd className="mt-0.5 text-[12px] text-muted-foreground">{hint}</dd> : null}
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="billing-methods">
        <h2 id="billing-methods" className="mb-3 text-[17px] font-semibold tracking-[-0.01em]">
          How you pay
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: Wallet,
              title: 'OpenSignet wallet',
              body: 'USDC on Base from your own wallet, approved with a code. It can renew your plan automatically.',
            },
            {
              icon: Zap,
              title: 'Any crypto wallet',
              body: 'Pay in USDC on Base from a wallet you connect. Each payment is approved in that wallet.',
            },
            {
              icon: CreditCard,
              title: 'Card',
              body: 'Card payments open soon. Plans paid by card will renew on the card automatically.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="console-card px-5 py-4">
              <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              <h3 className="mt-3 text-[14px] font-semibold">{title}</h3>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
