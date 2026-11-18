import type { ReactNode } from 'react';
import { Footer } from '@/components/landing/footer';
import { LandingNav } from '@/components/landing/nav';
import { SettingsShell } from '@/components/settings/settings-shell';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background">
      <LandingNav />
      <SettingsShell>{children}</SettingsShell>
      <Footer />
    </main>
  );
}
