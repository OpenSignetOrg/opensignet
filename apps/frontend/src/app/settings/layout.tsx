import type { ReactNode } from 'react';
import { ConsoleShell } from '@/components/console/console-shell';
import { SettingsShell } from '@/components/settings/settings-shell';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleShell>
      <SettingsShell>{children}</SettingsShell>
    </ConsoleShell>
  );
}
