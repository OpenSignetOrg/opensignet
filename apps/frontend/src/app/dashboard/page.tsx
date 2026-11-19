import type { Metadata } from 'next';
import { ConsoleOverview } from '@/components/console/overview';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Dashboard',
  description: 'Your OpenSignet identities, wallet and plan at a glance.',
  path: '/dashboard',
  index: false,
});

export default function DashboardPage() {
  return <ConsoleOverview />;
}
