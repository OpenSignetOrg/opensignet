/* eslint-disable @next/next/no-html-link-for-pages -- The sign-in shell links home with a full navigation. */
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { BrandMark } from '@/components/brand/brand-mark';
import { SignInFlow } from '@/components/sign-in/sign-in-flow';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Sign In',
  description:
    'Sign in to OpenSignet with Google, a one-time email code or a wallet. New accounts are created on first sign-in.',
  path: '/sign-in',
  index: false,
});

/**
 * A focused page with no site navigation: the brand mark links home, the card holds every way in.
 */
export default function SignInPage() {
  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,hsl(var(--brand-orange)/0.07),transparent_70%)]"
        aria-hidden
      />
      <header className="relative flex h-16 items-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-6 sm:pr-6">
        <a
          href="/"
          className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="OpenSignet home"
        >
          <BrandMark />
          <span className="text-base font-bold tracking-tight sm:text-lg">OpenSignet</span>
        </a>
      </header>
      <div className="relative flex flex-1 items-start justify-center pb-12 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 sm:items-center sm:px-6 sm:pb-20">
        <Suspense fallback={<SignInSkeleton />}>
          <SignInFlow />
        </Suspense>
      </div>
    </main>
  );
}

function SignInSkeleton() {
  return (
    <div className="w-full max-w-[420px]" aria-hidden>
      <div className="h-[520px] animate-pulse rounded-2xl border border-border/60 bg-card/60 motion-reduce:animate-none" />
    </div>
  );
}
