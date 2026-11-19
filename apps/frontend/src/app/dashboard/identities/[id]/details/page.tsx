import type { Metadata } from 'next';
import { IdentityDetailsTab } from '@/components/console/identity-tabs';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Identity details',
  description: 'Names, ownership, renewal and plan limits of one of your identities.',
  path: '/dashboard',
  index: false,
});

export default function IdentityDetailsPage() {
  return <IdentityDetailsTab />;
}
