import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LandingNav } from '@/components/landing/nav';
import { Footer } from '@/components/landing/footer';
import { CheckoutClient } from '@/components/checkout/checkout-client';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Checkout',
  description: 'Choose how to pay for your OpenSignet plan.',
  path: '/checkout',
  index: false,
});

export default function CheckoutPage() {
  return (
    <main className="min-h-screen bg-background">
      <LandingNav />
      <section className="container max-w-5xl py-8 sm:py-14">
        <Suspense fallback={<div className="h-96" aria-hidden />}>
          <CheckoutClient />
        </Suspense>
      </section>
      <Footer />
    </main>
  );
}
