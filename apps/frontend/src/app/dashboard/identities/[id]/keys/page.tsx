import type { Metadata } from 'next';
import { IdentityKeysTab } from '@/components/console/identity-tabs';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'API keys',
  description: 'API keys scoped to one of your identities.',
  path: '/dashboard',
  index: false,
});

export default function IdentityKeysPage() {
  return <IdentityKeysTab />;
}
