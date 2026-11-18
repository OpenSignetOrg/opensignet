import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LandingNav } from '@/components/landing/nav';
import { Footer } from '@/components/landing/footer';
import { CheckoutCompleteClient } from '@/components/checkout/checkout-complete-client';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Payment status',
  description: 'Confirmation of your OpenSignet plan payment.',
  path: '/checkout/complete',
  index: false,
});

export default function CheckoutCompletePage() {
  return (
    <main className="min-h-screen bg-background">
      <LandingNav />
      <section className="container max-w-5xl py-12 sm:py-20">
        <Suspense fallback={<div className="h-72" aria-hidden />}>
          <CheckoutCompleteClient />
        </Suspense>
      </section>
      <Footer />
    </main>
  );
}
