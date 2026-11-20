import type { Metadata } from 'next';
import { IdentityDomainTab } from '@/components/console/identity-domain';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Domain',
  description: 'Registration, renewal, nameservers and transfer lock of one of your identities.',
  path: '/dashboard',
  index: false,
});

export default function IdentityDomainPage() {
  return <IdentityDomainTab />;
}
