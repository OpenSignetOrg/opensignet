'use client';

import type { ReactNode } from 'react';
import { RotateCw, ShieldCheck, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/console/identity-bits';
import { PageTabs } from '@/components/console/page-tabs';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { SettingsProvider } from './settings-context';
import { StepUpProvider } from './step-up';

const TABS = [
  { href: '/settings', label: 'Account', icon: UserRound },
  { href: '/settings/security', label: 'Security', icon: ShieldCheck },
] as const;

/** Settings inside the console: heading, section tabs and the section body. */
export function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, how you sign in, and your account’s security."
      />
      <PageTabs tabs={TABS} label="Settings sections" />
      <AccountSurface>{children}</AccountSurface>
    </>
  );
}

/** The wallet, its own section of the console (not part of Settings). */
export function WalletShell({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader
        title="Wallet"
        description="Your OpenSignet wallet on Base: balance, approvals and payment methods."
      />
      <AccountSurface>{children}</AccountSurface>
    </>
  );
}

/** The account data and approval prompts the settings and wallet pages share. */
function AccountSurface({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="max-w-3xl">
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
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
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
