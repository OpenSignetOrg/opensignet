import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing/nav';
import { Footer } from '@/components/landing/footer';
import { RegisterFlow } from '@/components/register/register-flow';
import { FaqSection } from '@/components/faq-section';
import { REGISTER_FAQS } from '@/lib/faq-content';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Register a Domain and Identity for an AI Agent',
  description:
    'Search live domain availability and provision a domain, DNS, professional email and an OpenSignet Pass through one Base-native registration flow.',
  path: '/register',
});

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-background">
      <LandingNav />
      <section className="container max-w-3xl py-8 sm:py-16">
        <div className="mb-6 text-center sm:mb-10">
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Register your identity and email
          </h1>
          <p className="mt-3 text-muted-foreground">
            Pick a name. Choose your stack. OpenSignet handles the rest.
          </p>
        </div>
        <RegisterFlow />
        <FaqSection id="register-faq" items={REGISTER_FAQS} />
      </section>
      <Footer />
    </main>
  );
}
