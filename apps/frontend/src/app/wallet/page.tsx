import type { Metadata } from 'next';
import { WalletTab } from '@/components/settings/wallet-tab';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Wallet',
  description:
    'Your OpenSignet wallet on Base: balance, withdrawals, approvals and payment methods.',
  path: '/wallet',
  index: false,
});

export default function WalletPage() {
  return <WalletTab />;
}
