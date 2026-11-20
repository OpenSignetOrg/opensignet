'use client';

import { useState } from 'react';
import Link from 'next/link';
import { base } from 'wagmi/chains';
import { ChevronRight, Globe, Pin, Plus, RotateCw } from 'lucide-react';
import { AgentOnboarding } from '@/components/onboarding/agent-onboarding';
import { PlanSummary } from '@/components/dashboard/plan-summary';
import { DashboardRegistrationUpdates } from '@/components/register/registration-updates';
import { useRegistrationSnapshot } from '@/components/register/registration-tracker-provider';
import { Button } from '@/components/ui/button';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { formatDate } from '@/lib/utils';
import { useConsole, useConsoleAccount, type ConsoleIdentity } from './console-context';
import { IdentityTile, PageHeader, StatusPill } from './identity-bits';

const DAY = 86_400_000;

/** The console home: what needs attention, the account's numbers, its identities and its plan. */
export function ConsoleOverview() {
  const account = useConsoleAccount();
  const { identities, refresh } = useConsole();
  const wallet = account.embeddedWallet?.address as `0x${string}` | undefined;
  const { balanceFormatted, isLoading: balanceLoading } = useUsdcBalance(wallet, base.id);
  const tracking = useRegistrationSnapshot();
  const items = identities.status === 'ready' ? identities.items : null;
  const now = Date.now();
  const renewalsDue = items?.filter((item) => {
    if (item.status !== 'active' || !item.expiresAt) return false;
    const left = new Date(item.expiresAt).getTime() - now;
    return left >= 0 && left <= 30 * DAY;
  }).length;
  const firstName = account.displayName?.split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Overview'}
        description="Your identities, wallet and plan at a glance."
        actions={<AgentOnboarding />}
      />

      <DashboardRegistrationUpdates />

      <dl className="console-card mb-8 grid grid-cols-2 overflow-hidden lg:grid-cols-4">
        <Stat label="Identities" value={items ? String(items.length) : null} />
        <Stat
          label="Active"
          value={items ? String(items.filter((item) => item.status === 'active').length) : null}
        />
        <Stat
          label="Wallet balance"
          hint="USDC on Base"
          value={balanceLoading ? null : `$${Number(balanceFormatted).toFixed(2)}`}
          href="/settings/wallet"
        />
        <Stat
          label="Renewing in 30 days"
          value={renewalsDue === undefined ? null : String(renewalsDue)}
        />
      </dl>

      <section aria-labelledby="identities" className="mb-8 scroll-mt-24">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="identities" className="text-[17px] font-semibold tracking-[-0.01em]">
            Identities
          </h2>
          {items && items.length > 0 ? (
            <Button asChild variant="outline" size="sm" className="h-8 rounded-lg">
              <Link href="/register">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New
              </Link>
            </Button>
          ) : null}
        </div>
        <div className="console-card overflow-hidden">
          {identities.status === 'loading' ? (
            <div aria-busy="true">
              <span className="sr-only" role="status">
                Loading your identities
              </span>
              {[0, 1, 2].map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-3 border-b border-border/60 px-5 py-4 last:border-b-0"
                >
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-foreground/[0.06] motion-reduce:animate-none" />
                  <div className="h-4 w-48 animate-pulse rounded bg-foreground/[0.06] motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          ) : identities.status === 'error' ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 px-5 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                Your identities couldn’t be loaded. Purchases in progress are not affected.
              </span>
              <Button variant="outline" size="sm" onClick={refresh}>
                <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Try again
              </Button>
            </div>
          ) : items && items.length === 0 ? (
            <EmptyIdentities settingUp={tracking.attempts.length > 0} />
          ) : (
            <IdentityTable items={items ?? []} />
          )}
        </div>
      </section>

      <PlanSummary />
    </>
  );
}

function Stat({
  label,
  hint,
  value,
  href,
}: {
  label: string;
  hint?: string;
  value: string | null;
  href?: string;
}) {
  const body = (
    <>
      <dt className="flex items-center gap-1 text-[12.5px] font-medium text-muted-foreground">
        {label}
        {href ? <ChevronRight className="h-3.5 w-3.5 opacity-60" aria-hidden /> : null}
      </dt>
      <dd className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
        {value === null ? (
          <span className="inline-block h-[26px] w-14 animate-pulse rounded-md bg-foreground/[0.06] align-middle motion-reduce:animate-none">
            <span className="sr-only">Loading</span>
          </span>
        ) : (
          value
        )}
      </dd>
      {hint ? <dd className="mt-1.5 text-[12px] text-muted-foreground">{hint}</dd> : null}
    </>
  );
  const className =
    'min-w-0 border-border/60 px-5 py-5 [&:nth-child(odd)]:border-r lg:[&:not(:last-child)]:border-r [&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0';
  return (
    <div
      className={
        href
          ? `${className} relative transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/60 hover:bg-foreground/[0.025]`
          : className
      }
    >
      {body}
      {href ? (
        <Link
          href={href}
          className="absolute inset-0 focus-visible:outline-none"
          aria-label={`${label}: open your wallet`}
        />
      ) : null}
    </div>
  );
}

const PAGE = 15;

function IdentityTable({ items }: { items: ConsoleIdentity[] }) {
  const [limit, setLimit] = useState(PAGE);
  const hidden = items.length - limit;
  return (
    <>
      <div
        aria-hidden
        className="hidden grid-cols-[minmax(0,1fr)_128px_140px_20px] gap-4 border-b border-border/60 bg-foreground/[0.02] px-5 py-2.5 text-[12px] font-medium text-muted-foreground sm:grid"
      >
        <span>Domain</span>
        <span>Status</span>
        <span>Renews</span>
        <span />
      </div>
      <ul>
        {items.slice(0, limit).map((item) => (
          <li key={item.id} className="border-b border-border/60 last:border-b-0">
            <Link
              href={`/dashboard/identities/${encodeURIComponent(item.id)}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-foreground/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 sm:grid-cols-[minmax(0,1fr)_128px_140px_20px]"
            >
              <span className="flex min-w-0 items-center gap-3">
                <IdentityTile domain={item.domain} />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[14.5px] font-medium">{item.domain}</span>
                    {item.pinned ? (
                      <Pin
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        strokeWidth={2}
                        aria-label="Pinned"
                      />
                    ) : null}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {item.basename ?? `hello@${item.domain}`}
                  </span>
                </span>
              </span>
              <span className="justify-self-end sm:justify-self-start">
                <StatusPill status={item.status} />
              </span>
              <span className="hidden text-[13px] tabular-nums text-muted-foreground sm:block">
                {item.expiresAt ? formatDate(item.expiresAt) : '—'}
              </span>
              <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <div className="border-t border-border/60 px-5 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full text-[13px] font-medium"
            onClick={() => setLimit((value) => value + PAGE)}
          >
            Show {Math.min(PAGE, hidden)} more
            <span className="text-muted-foreground">· {hidden} left</span>
          </Button>
        </div>
      ) : null}
    </>
  );
}

function EmptyIdentities({ settingUp }: { settingUp: boolean }) {
  return (
    <div className="flex flex-col items-center px-5 py-14 text-center">
      <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border/80 bg-background/70 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.8)]">
        <Globe className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold">
        {settingUp ? 'Your purchase is being set up' : 'No identities yet'}
      </h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
        {settingUp
          ? 'Progress is shown above. The identity appears here when it is ready.'
          : 'Get a domain to create your first identity, with its own inbox, DNS and API keys.'}
      </p>
      {settingUp ? null : (
        <Button asChild className="mt-5 rounded-lg">
          <Link href="/register">
            <Plus className="h-4 w-4" aria-hidden />
            Get your first domain
          </Link>
        </Button>
      )}
    </div>
  );
}
