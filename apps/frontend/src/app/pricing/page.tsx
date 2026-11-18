import type { Metadata } from 'next';
import { PublicNav } from '@/components/landing/public-nav';
import { Footer } from '@/components/landing/footer';
import { Pricing } from '@/components/landing/pricing';
import { JsonLd } from '@/components/seo/json-ld';
import { FaqSection } from '@/components/faq-section';
import { PRICING_FAQS } from '@/lib/faq-content';
import { breadcrumbJsonLd, createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Pricing',
  description:
    'Every OpenSignet identity includes a professional inbox with 3,000 emails a month. Plus, Pro, Max and Enterprise email plans add volume, API keys, DNS records and aliases for your whole account, billed monthly or yearly.',
  path: '/pricing',
});

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'OpenSignet', path: '/' },
          { name: 'Pricing', path: '/pricing' },
        ])}
      />
      <PublicNav current="/pricing" />

      <section className="border-b border-border/70">
        {/* Same column as the pricing grid below: full container, centred 5xl content. */}
        <div className="container mx-auto py-12 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <p className="text-sm font-semibold text-[hsl(var(--brand-orange))]">Pricing</p>
            <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">
              Pricing for professional email
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Every identity includes a professional inbox. Choose a plan when you need more.
            </p>
          </div>
        </div>
      </section>

      <Pricing />
      <div className="container">
        <FaqSection
          id="pricing-faq"
          items={PRICING_FAQS}
          className="mx-auto mt-4 max-w-5xl sm:mt-8"
        />
      </div>
      <Footer />
    </main>
  );
}
