import type { ReactNode } from 'react';
import { ConsoleShell } from '@/components/console/console-shell';
import { WalletShell } from '@/components/settings/settings-shell';

export default function WalletLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleShell>
      <WalletShell>{children}</WalletShell>
    </ConsoleShell>
  );
}
