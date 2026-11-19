import type { Metadata } from 'next';
import { IdentityEmailTab } from '@/components/console/identity-tabs';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Email',
  description: 'The inbox, addresses and sending for one of your identities.',
  path: '/dashboard',
  index: false,
});

export default function IdentityEmailPage() {
  return <IdentityEmailTab />;
}
