'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { AgentOnboarding } from '@/components/onboarding/agent-onboarding';
import { ChevronRight, Globe, Loader2, Plus, Settings, Wallet } from 'lucide-react';
import { SignInGate } from '@/components/account/sign-in-gate';
import { SignOutButton } from '@/components/account/sign-out-button';
import type { DashboardPreview } from './dashboard-preview';
import { PlanSummary } from './plan-summary';
import { useSiwe } from '@/hooks/use-siwe';
import { useAccountSession } from '@/hooks/use-account-session';
import { createAccountClient } from '@/lib/account-client';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { shortAddress, formatDate } from '@/lib/utils';
import { DashboardRegistrationUpdates } from '@/components/register/registration-updates';
import { useRegistrationSnapshot } from '@/components/register/registration-tracker-provider';
import { REGISTRATION_CHANGED_EVENT } from '@/lib/registration-progress';

export interface DashboardAgent {
  id: string;
  domain: string;
  basename: string | null;
  ensName: string | null;
  agentIdNft: number | null;
  status: string;
  framework: string | null;
  createdAt: string;
  expiresAt: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  provisioning: 'Setting up',
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

export function DashboardClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { address: connected, isConnected, status: accountStatus } = useAccount();
  const { session, checking } = useSiwe();
  // Any sign-in method opens the dashboard. Identities are shown for the wallet this session signed
  // in with, or otherwise for the account's own OpenSignet wallet.
  const accountSession = useAccountSession();
  // undefined while loading; null in the moments after sign-up, while the wallet is created.
  const [accountWallet, setAccountWallet] = useState<string | null | undefined>(undefined);
  const [accountWalletFailed, setAccountWalletFailed] = useState(false);
  const [accountWalletAttempt, setAccountWalletAttempt] = useState(0);
  const retryAccountWallet = useCallback(() => setAccountWalletAttempt((value) => value + 1), []);
  useEffect(() => {
    if (accountSession.status !== 'signed-in') return;
    const controller = new AbortController();
    setAccountWalletFailed(false);
    createAccountClient()
      .get(controller.signal)
      .then((account) => setAccountWallet(account.embeddedWallet?.address ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setAccountWalletFailed(true);
      });
    return () => controller.abort();
  }, [accountSession.status, accountWalletAttempt]);
  const walletSession = Boolean(
    session.authenticated &&
    connected &&
    session.address?.toLowerCase() === connected.toLowerCase(),
  );
  const address = (walletSession ? connected : (accountWallet ?? undefined)) as
    `0x${string}` | undefined;
  const { balanceFormatted, isLoading: balanceLoading } = useUsdcBalance(address, base.id);
  const [loadedAgents, setAgents] = useState<DashboardAgent[]>([]);
  const [agentWallet, setAgentWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const tracking = useRegistrationSnapshot();
  const eligible = accountSession.status === 'signed-in' && Boolean(address);
  // Development only: `/dashboard?preview=1` shows the signed-in layout with sample data while the
  // backend is not running. Production builds remove this branch and the sample module.
  const [preview, setPreview] = useState<DashboardPreview | 'loading' | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (new URLSearchParams(window.location.search).get('preview') !== '1') return;
    setPreview('loading');
    void import('./dashboard-preview').then((module) => setPreview(module.DASHBOARD_PREVIEW));
  }, []);
  const sample = preview && preview !== 'loading' ? preview : null;

  const agents = sample
    ? sample.agents
    : eligible && agentWallet === address?.toLowerCase()
      ? loadedAgents
      : [];
  const agentCountsKnown =
    Boolean(sample) || (eligible && agentWallet === address?.toLowerCase() && !loadError);
  const viewAddress = sample ? sample.address : address;
  const viewBalance = sample ? sample.balanceUsdc : balanceFormatted;
  const viewBalanceLoading = sample ? false : balanceLoading;

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(REGISTRATION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(REGISTRATION_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!address || !eligible) {
      setAgents([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/v1/agents/by-wallet/${address}`, { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as DashboardAgent[];
      })
      .then((agentList) => {
        if (cancelled) return;
        if (!Array.isArray(agentList)) throw new Error('Invalid agent list');
        setAgents(agentList);
        setAgentWallet(address.toLowerCase());
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, eligible, revision]);

  const resolving =
    !mounted ||
    preview === 'loading' ||
    accountSession.status === 'loading' ||
    (accountSession.status === 'signed-in' &&
      !address &&
      accountWallet === undefined &&
      !accountWalletFailed) ||
    accountStatus === 'reconnecting' ||
    accountStatus === 'connecting' ||
    (isConnected && checking);

  if (resolving) return <DashboardSkeleton />;

  if (accountSession.status === 'signed-in' && !address && !sample && accountWallet === null) {
    return <WalletSettingUp onRetry={retryAccountWallet} />;
  }

  if (accountSession.status === 'signed-in' && !address && !sample) {
    return (
      <section className="container flex flex-col items-center gap-4 py-16 sm:py-24">
        <InlineNotice className="max-w-md">
          Your account couldn’t be loaded. Check your connection and try again.
        </InlineNotice>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAccountWalletAttempt((n) => n + 1)}
        >
          Try again
        </Button>
      </section>
    );
  }

  if (!eligible && !sample) {
    return (
      <section className="container py-12 sm:py-20">
        <SignInGate
          title="Sign in to your dashboard"
          description="Your identities, domains, inboxes and renewals are private to your account."
          points={[
            'See every identity you own and its domain, DNS and email status',
            'Track purchases while they are being set up',
            'Manage renewals before anything expires',
          ]}
        />
      </section>
    );
  }

  const renewalsDueCount = agents.filter((a) => {
    if (a.status !== 'active' || !a.expiresAt) return false;
    const daysUntilExpiry = (new Date(a.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  }).length;

  return (
    <section className="container py-8 sm:py-12">
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Your identities, domains and renewals.</p>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <AgentOnboarding />
          <Button asChild className="h-10 w-full sm:w-auto">
            <Link href="/register">
              <Plus className="h-4 w-4" aria-hidden />
              Get a domain
            </Link>
          </Button>
        </div>
      </div>

      <DashboardRegistrationUpdates />

      <dl className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Identities"
          value={agentCountsKnown ? String(agents.length) : null}
          loading={loading}
        />
        <Stat
          label="Active"
          value={
            agentCountsKnown ? String(agents.filter((a) => a.status === 'active').length) : null
          }
          loading={loading}
        />
        <Stat
          label="USDC balance"
          value={`$${Number(viewBalance).toFixed(2)}`}
          loading={viewBalanceLoading}
        />
        <Stat
          label="Renewals due"
          hint="in the next 30 days"
          value={agentCountsKnown ? String(renewalsDueCount) : null}
          loading={loading}
        />
      </dl>

      <PlanSummary sample={sample?.plan} />

      <Card className="premium-surface">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Your identities</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center"
            >
              <span>
                Your identity list is temporarily unavailable. Purchase tracking is preserved.
              </span>
              <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
                Refresh
              </Button>
            </div>
          ) : loading ? (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
              <span className="sr-only" role="status">
                Loading your identities
              </span>
            </div>
          ) : agents.length === 0 ? (
            <div className="py-12 text-center">
              <span
                className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground"
                aria-hidden
              >
                <Globe className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <p className="mt-4 font-medium">
                {tracking.attempts.length ? 'Your purchase is being set up' : 'No identities yet'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                {tracking.attempts.length
                  ? 'Progress is shown above. The identity appears here when it is ready.'
                  : 'Get a domain to create your first identity with DNS and email.'}
              </p>
              {!tracking.attempts.length && (
                <Button asChild className="mt-5">
                  <Link href="/register">
                    <Plus className="h-4 w-4" aria-hidden />
                    Get your first domain
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link
                    href={`/dashboard/identities/${encodeURIComponent(agent.id)}`}
                    className="flex flex-col gap-3 rounded-lg py-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:-mx-3 sm:flex-row sm:items-center sm:justify-between sm:px-3"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-sm font-semibold uppercase text-foreground/80"
                        aria-hidden
                      >
                        {agent.domain.replace(/^www\./, '').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{agent.domain}</div>
                        {agent.basename && (
                          <div className="wrap-anywhere font-mono text-xs text-muted-foreground">
                            {agent.basename}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:flex-shrink-0 sm:justify-end">
                      <Badge variant={agent.status === 'active' ? 'success' : 'secondary'}>
                        {STATUS_LABELS[agent.status] ?? agent.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(agent.createdAt)}
                      </span>
                      <ChevronRight
                        className="hidden h-4 w-4 text-muted-foreground sm:block"
                        aria-hidden
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section
        aria-labelledby="dashboard-account"
        className="mt-12 flex flex-col gap-3 border-t border-border/70 pt-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <h2 id="dashboard-account" className="text-sm font-semibold">
            Account
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Signed in as{' '}
            <span className="break-all text-foreground">
              {accountSession.status === 'signed-in' &&
              (accountSession.account.displayName || accountSession.account.email) ? (
                accountSession.account.displayName || accountSession.account.email
              ) : (
                <span className="font-mono">
                  {viewAddress ? shortAddress(viewAddress) : 'your account'}
                </span>
              )}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Button asChild variant="outline" size="sm" className="h-9 w-full sm:w-auto">
            <Link href="/settings">
              <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Settings
            </Link>
          </Button>
          <SignOutButton />
        </div>
      </section>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <section className="container py-8 sm:py-12" aria-busy="true">
      <span className="sr-only" role="status">
        Loading your dashboard
      </span>
      <div className="mb-8 h-9 w-48 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none" />
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="h-[104px] animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted/50 motion-reduce:animate-none" />
    </section>
  );
}

function Stat({
  label,
  hint,
  value,
  loading,
}: {
  label: string;
  /** Extra context for the label, shown on wider cards and always read by screen readers. */
  hint?: string;
  value: string | null;
  loading?: boolean;
}) {
  return (
    <div className="premium-surface min-w-0 rounded-xl border p-4 sm:p-5">
      <dt className="truncate text-[13px] text-muted-foreground sm:text-sm">
        {label}
        {hint ? <span className="sr-only sm:not-sr-only"> {hint}</span> : null}
      </dt>
      <dd className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">
        {loading ? (
          <span role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">Loading {label.toLowerCase()}</span>
          </span>
        ) : value === null ? (
          <>
            <span aria-hidden className="text-muted-foreground">
              —
            </span>
            <span className="sr-only">Unavailable</span>
          </>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

/**
 * Signed in in the moments after sign-up, before the account's wallet exists. It is created
 * automatically, so the page simply checks again until it appears.
 */
function WalletSettingUp({ onRetry }: { onRetry: () => void }) {
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 20) return;
    const timer = window.setTimeout(() => {
      setTries((value) => value + 1);
      onRetry();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [tries, onRetry]);
  const slow = tries >= 20;
  return (
    <section className="container flex justify-center py-12 sm:py-20">
      <div className="premium-surface w-full max-w-lg rounded-2xl border p-6 text-center sm:p-8">
        <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/80 bg-card text-foreground">
          <Wallet className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="mt-4 text-balance text-xl font-semibold tracking-tight sm:text-2xl">
          {slow ? 'Your wallet is almost ready' : 'Setting up your wallet'}
        </h1>
        <p
          role="status"
          className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-6 text-muted-foreground"
        >
          {slow
            ? 'This is taking longer than usual. Your wallet will appear here on its own.'
            : 'Every OpenSignet account comes with its own wallet on Base. This takes a moment.'}
        </p>
        {slow ? (
          <Button
            type="button"
            variant="outline"
            className="mt-6 h-10 w-full sm:w-auto"
            onClick={() => setTries(0)}
          >
            Check again
          </Button>
        ) : (
          <Loader2
            className="mx-auto mt-6 h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-hidden
          />
        )}
      </div>
    </section>
  );
}
