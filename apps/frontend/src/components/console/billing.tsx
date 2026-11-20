'use client';

import Link from 'next/link';
import { ArrowUpRight, CreditCard, Wallet, Zap } from 'lucide-react';
import { PlanSummary } from '@/components/dashboard/plan-summary';
import { PageHeader } from './identity-bits';

/** Billing: the account's plan (its limits and automatic renewal) and how payment works. */
export function ConsoleBilling() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan covers your whole account, and every identity in it."
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
