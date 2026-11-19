import type { Metadata } from 'next';
import { ConsoleBilling } from '@/components/console/billing';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Billing',
  description: 'Your OpenSignet plan, what it includes and how it renews.',
  path: '/dashboard/billing',
  index: false,
});

export default function BillingPage() {
  return <ConsoleBilling />;
}
