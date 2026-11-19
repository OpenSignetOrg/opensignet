import type { Metadata } from 'next';
import { IdentityDnsTab } from '@/components/console/identity-tabs';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'DNS',
  description: 'The DNS records of one of your identities.',
  path: '/dashboard',
  index: false,
});

export default function IdentityDnsPage() {
  return <IdentityDnsTab />;
}
