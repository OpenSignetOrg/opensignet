import type { Metadata } from 'next';
import { AccountTab } from '@/components/settings/account-tab';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Account Settings',
  description: 'Manage your OpenSignet profile, name and photo.',
  path: '/settings',
  index: false,
});

export default function SettingsAccountPage() {
  return <AccountTab />;
}
