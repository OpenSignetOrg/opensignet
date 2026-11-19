'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, FileText, Globe, KeyRound, Mail } from 'lucide-react';
import {
  OwnerManagementGate,
  type ManagementAccess,
} from '@/components/agents/owner-management-gate';
import { ManagementSessionProvider } from '@/components/agents/management-session';
import { managementViewSchema, type ManagementView } from '@/lib/backend-contracts';
import { SESSION_CHANGED_EVENT } from '@/hooks/use-account-session';
import { REGISTRATION_CHANGED_EVENT } from '@/lib/registration-progress';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';
import { formatDate } from '@/lib/utils';
import { useConsole } from './console-context';
import { IdentityTile, StatusPill } from './identity-bits';
import { PageTabs } from './page-tabs';

interface IdentityValue {
  view: ManagementView;
  reload: () => void;
}

const IdentityContext = createContext<IdentityValue | null>(null);

/** The open identity's management view; only inside an identity page. */
export function useIdentity(): IdentityValue {
  const value = useContext(IdentityContext);
  if (!value) throw new Error('useIdentity must be used inside IdentityShell');
  return value;
}

/**
 * One identity: its heading (domain, status, inbox, expiry) and tabs, Email first. The management
 * view is loaded once here and shared by every tab. Anyone but the owner gets the same answer as
 * for an identity that does not exist.
 */
export function IdentityShell({
  identityId,
  children,
}: {
  identityId: string;
  children: ReactNode;
}) {
  const { state } = useConsole();
  const accountId = state.status === 'ready' ? state.account.id : null;
  const [loaded, setLoaded] = useState<{ key: string; view: ManagementView } | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const key = `${accountId}:${identityId}`;

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(REGISTRATION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(REGISTRATION_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    setFailed(null);
    fetch(`/api/v1/agents/${encodeURIComponent(identityId)}/management-view`, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
          return;
        }
        if (response.status === 403 || response.status === 404) {
          setDenied(key);
          return;
        }
        if (!response.ok) throw new Error('management unavailable');
        const view = managementViewSchema.parse(await response.json());
        if (view.agent.id !== identityId) throw new Error('unexpected identity');
        if (!controller.signal.aborted) setLoaded({ key, view });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(key);
      });
    return () => controller.abort();
  }, [accountId, identityId, key, revision]);

  const view = loaded?.key === key ? loaded.view : null;
  const base = `/dashboard/identities/${encodeURIComponent(identityId)}`;

  if (!view) {
    const access: ManagementAccess =
      denied === key ? 'not-owner' : failed === key ? 'unavailable' : 'checking';
    return (
      <>
        <Breadcrumb domain={null} />
        {access === 'checking' ? (
          <IdentitySkeleton />
        ) : (
          <OwnerManagementGate access={access} onRetry={() => setRevision((value) => value + 1)} />
        )}
      </>
    );
  }

  const { agent, inbox } = view;
  const tabs = [
    { href: base, label: 'Email', icon: Mail },
    { href: `${base}/dns`, label: 'DNS', icon: Globe },
    { href: `${base}/keys`, label: 'API keys', icon: KeyRound },
    { href: `${base}/details`, label: 'Details', icon: FileText },
  ] as const;

  return (
    <IdentityContext.Provider value={{ view, reload: () => setRevision((value) => value + 1) }}>
      <Breadcrumb domain={agent.domain} />
      <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <IdentityTile domain={agent.domain} size="lg" />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="wrap-anywhere text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]">
                {agent.domain}
              </h1>
              <StatusPill status={agent.status} />
            </div>
            <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5">
                <dt className="sr-only">Inbox</dt>
                <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                <dd className="truncate">{inbox?.emailAddress ?? `hello@${agent.domain}`}</dd>
              </div>
              {agent.expiresAt ? (
                <div className="flex items-center gap-1.5">
                  <dt>Renews</dt>
                  <dd className="tabular-nums text-foreground/80">{formatDate(agent.expiresAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
        <a
          href={`https://${agent.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-border/90 bg-card px-3 text-[13.5px] font-medium shadow-[0_1px_2px_hsl(90_5%_12%/0.06)] transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Visit domain
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </a>
      </header>
      <PageTabs tabs={tabs} label={`${agent.domain} sections`} />
      <ManagementSessionProvider signedIn>{children}</ManagementSessionProvider>
    </IdentityContext.Provider>
  );
}

function Breadcrumb({ domain }: { domain: string | null }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
        <li>
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            Overview
          </Link>
        </li>
        <li aria-hidden>
          <ChevronRight className="h-3.5 w-3.5" />
        </li>
        <li className="min-w-0 truncate">
          {domain ? (
            <span aria-current="page" className="text-foreground/85">
              {domain}
            </span>
          ) : (
            'Identity'
          )}
        </li>
      </ol>
    </nav>
  );
}

function IdentitySkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading this identity
      </span>
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 animate-pulse rounded-xl bg-foreground/[0.06] motion-reduce:animate-none" />
        <div className="flex flex-col gap-2">
          <div className="h-7 w-56 animate-pulse rounded-md bg-foreground/[0.06] motion-reduce:animate-none" />
          <div className="h-4 w-40 animate-pulse rounded-md bg-foreground/[0.04] motion-reduce:animate-none" />
        </div>
      </div>
      <div className="mt-8 h-11 border-b border-border/80" />
      <div className="mt-8 h-72 animate-pulse rounded-2xl bg-foreground/[0.04] motion-reduce:animate-none" />
    </div>
  );
}
