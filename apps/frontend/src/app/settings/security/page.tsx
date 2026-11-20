import type { Metadata } from 'next';
import { SecurityTab } from '@/components/settings/security-tab';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Security Settings',
  description: 'See your signed-in devices and delete your account.',
  path: '/settings/security',
  index: false,
});

export default function SettingsSecurityPage() {
  return <SecurityTab />;
}
