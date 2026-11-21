import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import { Button } from '@/components/ui/button';
import { monthlyPlanPrice } from '@/lib/plan-pricing';

const free = SERVICE_PLAN_CATALOG.included.limits;

/** The closing invitation, with pricing in one sentence. */
export function Closing() {
  return (
    <section aria-labelledby="home-start" className="container pb-8 pt-24 sm:pt-32">
      <div className="mx-auto max-w-6xl border-y border-foreground/15 py-16 text-center sm:py-24">
        <p className="text-sm font-medium text-[hsl(var(--brand-orange))]">Get started</p>
        <h2
          id="home-start"
          className="mx-auto mt-3 max-w-3xl text-balance text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl md:text-6xl"
        >
          Start with a name.
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          Every domain includes the Free plan: a professional inbox with{' '}
          {free.monthlyEmails.toLocaleString('en-US')} emails a month, DNS and an OpenSignet Pass.
          You pay only the registrar’s price. Paid plans start at{' '}
          {monthlyPlanPrice(SERVICE_PLAN_CATALOG.plus.monthlyPriceUsdcAtomic)} a month.
        </p>
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button asChild size="xl" className="group">
            <Link href="/register">
              Get your domain
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                aria-hidden
              />
            </Link>
          </Button>
          <Button asChild size="xl" variant="outline">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
