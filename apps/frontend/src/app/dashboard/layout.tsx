import type { ReactNode } from 'react';
import { ConsoleShell } from '@/components/console/console-shell';

/** The signed-in console: every page under /dashboard shares its sidebar and account data. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
