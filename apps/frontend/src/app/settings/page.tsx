import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AccountTabPage } from '@/components/settings/account-tab-page';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Account Settings',
  description: 'Manage your OpenSignet profile, email and sign-in methods.',
  path: '/settings',
  index: false,
});

export default function SettingsAccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountTabPage />
    </Suspense>
  );
}
