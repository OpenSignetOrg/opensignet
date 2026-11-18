import type { Metadata } from 'next';
import { PublicNav } from '@/components/landing/public-nav';
import { Hero } from '@/components/landing/hero';
import { HomeFaq } from '@/components/landing/home-faq';
import { Product } from '@/components/landing/home/product';
import { Developers } from '@/components/landing/home/developers';
import { Ownership } from '@/components/landing/home/ownership';
import { Closing } from '@/components/landing/home/closing';
import { Footer } from '@/components/landing/footer';
import { JsonLd } from '@/components/seo/json-ld';
import {
  createPageMetadata,
  DEFAULT_DESCRIPTION,
  HOME_SOCIAL_TITLE,
  HOME_TITLE,
  homepageJsonLd,
} from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: HOME_SOCIAL_TITLE,
  searchTitle: HOME_TITLE,
  shareTitle: HOME_SOCIAL_TITLE,
  description: DEFAULT_DESCRIPTION,
  path: '/',
});

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <JsonLd data={homepageJsonLd()} />
      <PublicNav />
      <Hero />
      <Product />
      <Developers />
      <Ownership />
      <Closing />
      <HomeFaq />
      <Footer />
    </main>
  );
}
