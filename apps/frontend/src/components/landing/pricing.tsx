import { ArrowRight, Calculator, Check, Gauge, ShieldCheck, Sprout, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import { monthlyPlanPrice, yearlyPlanCharge } from '@/lib/plan-pricing';
import { EnterprisePlanSelector } from './enterprise-plan-selector';
import {
  BillingPeriodProvider,
  BillingPeriodToggle,
  CurrentPlanBadge,
  PlanCta,
  PlanPrice,
} from './billing-period';
import { PlanCarousel } from './plan-carousel';
import Link from 'next/link';

const planBlocks = [
  {
    icon: Sprout,
    title: 'Free',
    plan: null,
    monthly: SERVICE_PLAN_CATALOG.included.monthlyPriceUsdcAtomic,
    yearly: SERVICE_PLAN_CATALOG.included.yearlyPriceUsdcAtomic,
    description: 'Everything you need to start, included with every domain.',
    items: [
      '3 identities',
      '3,000 sent + received/month',
      'Professional inbox on your domain',
      '1 email alias per identity',
      '1 API key per identity',
      '20 DNS records per identity',
      '30-day retention',
    ],
  },
  {
    icon: Calculator,
    title: 'Plus',
    plan: 'plus',
    monthly: SERVICE_PLAN_CATALOG.plus.monthlyPriceUsdcAtomic,
    yearly: SERVICE_PLAN_CATALOG.plus.yearlyPriceUsdcAtomic,
    description: 'Higher limits for active identities and production apps.',
    items: [
      '10 identities',
      '25,000 sent + received/month',
      '5 email aliases per identity',
      '5 API keys per identity',
      '50 DNS records per identity',
      '30-day retention',
    ],
  },
  {
    icon: Zap,
    title: 'Pro',
    plan: 'pro',
    monthly: SERVICE_PLAN_CATALOG.pro.monthlyPriceUsdcAtomic,
    yearly: SERVICE_PLAN_CATALOG.pro.yearlyPriceUsdcAtomic,
    description: 'For production workloads with larger email volume.',
    items: [
      '25 identities',
      '50,000 sent + received/month',
      '10 email aliases per identity',
      '10 API keys per identity',
      '100 DNS records per identity',
      'Priority support',
      '30-day retention',
    ],
  },
  {
    icon: Gauge,
    title: 'Max',
    plan: 'max',
    monthly: SERVICE_PLAN_CATALOG.max.monthlyPriceUsdcAtomic,
    yearly: SERVICE_PLAN_CATALOG.max.yearlyPriceUsdcAtomic,
    description: 'More capacity for busy teams and high-volume apps.',
    items: [
      '60 identities',
      '100,000 sent + received/month',
      '15 email aliases per identity',
      '20 API keys per identity',
      '150 DNS records per identity',
      'Priority support',
      '30-day retention',
    ],
  },
];

const enterprisePlanOptions = ENTERPRISE_PLAN_OFFERS.map((offer) => ({
  sku: offer.sku,
  monthlyEmails: offer.monthlyEmails,
  identities: offer.identities,
  monthly: monthlyPlanPrice(offer.monthlyPriceUsdcAtomic),
  yearly: yearlyPlanCharge(offer.yearlyPriceUsdcAtomic),
}));

export function Pricing() {
  return (
    <section aria-labelledby="pricing-plans" className="py-12 sm:py-16">
      <BillingPeriodProvider>
        <div className="container">
          <div className="mx-auto max-w-5xl">
            <div className="mb-5 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="pricing-plans" className="text-2xl font-bold tracking-tight">
                  Plans
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Plus, Pro, Max and Enterprise unlock higher limits for your whole account.
                </p>
              </div>
              <BillingPeriodToggle className="self-start sm:self-auto" />
            </div>
          </div>

          <div className="mx-auto max-w-5xl">
            <PlanCarousel label="Plans">
              {planBlocks.map((plan) => {
                const Icon = plan.icon;
                return (
                  <Card
                    key={plan.title}
                    className="interactive-surface premium-surface relative h-full w-full border-border/60"
                  >
                    <CurrentPlanBadge sku={plan.plan} />
                    <CardContent className="flex h-full flex-col p-5 sm:p-6">
                      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border/70 bg-background/60 text-primary shadow-sm">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-semibold">{plan.title}</h3>
                      <PlanPrice
                        monthly={monthlyPlanPrice(plan.monthly)}
                        yearly={yearlyPlanCharge(plan.yearly)}
                        className="mt-3 font-mono text-xl font-bold"
                      />
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {plan.description}
                      </p>
                      <ul className="mt-5 space-y-2.5">
                        {plan.items.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-700" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <PlanCta plan={plan.plan} label={plan.plan ? 'Get now' : 'Use Free'} />
                    </CardContent>
                  </Card>
                );
              })}
              <Card className="interactive-surface premium-surface relative h-full w-full border-border/60">
                <CurrentPlanBadge sku="enterprise" />
                <CardContent className="flex h-full flex-col p-5 sm:p-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border/70 bg-background/60 text-primary shadow-sm">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Enterprise</h3>
                  <EnterprisePlanSelector offers={enterprisePlanOptions}>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      High-volume email and priority support for large teams.
                    </p>
                    <ul className="mt-5 space-y-2.5">
                      {[
                        'Combined sent + received usage',
                        '20 email aliases per identity',
                        '25 API keys per identity',
                        '200 DNS records per identity',
                        'Enterprise support',
                        '30-day retention',
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-700" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </EnterprisePlanSelector>
                </CardContent>
              </Card>
            </PlanCarousel>
          </div>

          <div className="mt-12 flex justify-center">
            <Button asChild size="xl" className="group w-full sm:w-auto">
              <Link href="/register">
                Get your domain
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>
      </BillingPeriodProvider>
    </section>
  );
}
