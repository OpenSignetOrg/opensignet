import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicNav } from '@/components/landing/public-nav';
import { Footer } from '@/components/landing/footer';
import { Button } from '@/components/ui/button';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Page Not Found',
  description: 'The requested OpenSignet page or identity could not be found.',
  path: '/404',
  notFound: true,
});

export default function NotFoundPage() {
  return (
    <main className="min-h-screen bg-background">
      <PublicNav />
      <section className="container flex min-h-[60vh] max-w-3xl flex-col justify-center py-16">
        <p className="text-sm font-semibold uppercase text-primary">404</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Page not found</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          This page doesn’t exist or has moved. Check the address, or start from the home page.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </section>
      <Footer />
    </main>
  );
}
