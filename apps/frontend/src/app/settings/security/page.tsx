import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SecurityTabPage } from '@/components/settings/security-tab-page';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Security Settings',
  description: 'Manage your email, sign-in methods and signed-in devices.',
  path: '/settings/security',
  index: false,
});

export default function SettingsSecurityPage() {
  return (
    <Suspense fallback={null}>
      <SecurityTabPage />
    </Suspense>
  );
}
