'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RotateCw, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { cn } from '@/lib/utils';
import { SettingsProvider } from './settings-context';
import { StepUpProvider } from './step-up';

const TABS = [
  { href: '/settings', label: 'Account', icon: UserRound },
  { href: '/settings/security', label: 'Security', icon: ShieldCheck },
  { href: '/settings/wallet', label: 'Wallet', icon: Wallet },
] as const;

/** Settings frame: title, tab navigation (side rail from 1024px, tab bar below) and the tab body. */
export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = pathname?.replace(/\/$/, '') || '/settings';

  return (
    <div className="container max-w-5xl py-8 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-[15px]">
          Manage your profile, how you sign in, and your OpenSignet wallet.
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Settings" className="-mx-4 mb-6 sm:mx-0 lg:mb-0">
          <ul className="flex gap-0.5 overflow-x-auto border-b border-border/80 px-4 [scrollbar-width:none] sm:px-0 lg:sticky lg:top-24 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-b-0">
            {TABS.map(({ href, label, icon: Icon }) => {
              const active = current === href;
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-2 whitespace-nowrap px-2.5 py-3 text-sm font-medium min-[360px]:px-3 lg:gap-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 lg:rounded-lg lg:py-2.5',
                      active
                        ? 'text-foreground lg:bg-accent/80'
                        : 'text-muted-foreground hover:text-foreground lg:hover:bg-accent/50',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    {label}
                    {active && (
                      <span
                        className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-foreground lg:hidden"
                        aria-hidden
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <SettingsProvider
            loading={<SettingsSkeleton />}
            unavailable={(message, retry) => (
              <div className="flex flex-col items-start gap-4">
                <InlineNotice>{message}</InlineNotice>
                <Button type="button" variant="outline" size="sm" onClick={retry}>
                  <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Try again
                </Button>
              </div>
            )}
          >
            <StepUpProvider>
              <div className="flex flex-col gap-6">{children}</div>
            </StepUpProvider>
          </SettingsProvider>
        </div>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading settings">
      {[176, 240].map((height) => (
        <div
          key={height}
          style={{ height }}
          className="animate-pulse rounded-2xl border border-border/60 bg-card/60 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
