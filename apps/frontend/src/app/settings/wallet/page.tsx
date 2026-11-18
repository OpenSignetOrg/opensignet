import type { Metadata } from 'next';
import { WalletTab } from '@/components/settings/wallet-tab';
import { createPageMetadata } from '@/lib/seo';

export const metadata: Metadata = createPageMetadata({
  title: 'Wallet Settings',
  description: 'See your OpenSignet wallet and export its private key safely.',
  path: '/settings/wallet',
  index: false,
});

export default function SettingsWalletPage() {
  return <WalletTab />;
}
