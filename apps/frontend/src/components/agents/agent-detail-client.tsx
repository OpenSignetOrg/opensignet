'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LandingNav } from '@/components/landing/nav';
import { Footer } from '@/components/landing/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { RenewalManagement } from '@/components/agents/renewal-management';
import { DnsManagement } from '@/components/agents/dns-management';
import { EmailManagement } from '@/components/agents/email-management';
import { ServicePlanManagement } from '@/components/agents/service-plan-management';
import { ApiKeyManagement } from '@/components/agents/api-key-management';
import {
  OwnerManagementGate,
  type ManagementAccess,
} from '@/components/agents/owner-management-gate';
import { ManagementSessionProvider } from '@/components/agents/management-session';
import { shortAddress, formatDate, timeAgo } from '@/lib/utils';
import { managementViewSchema, type ManagementView } from '@/lib/backend-contracts';
import { SESSION_CHANGED_EVENT, useAccountSession } from '@/hooks/use-account-session';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';
import { REGISTRATION_CHANGED_EVENT } from '@/lib/registration-progress';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
};

export function AgentDetailClient({ agentId }: { agentId: string }) {
  const router = useRouter();
  // Management follows the signed-in account, whichever way it signed in. The API decides
  // whether that account owns this identity.
  const accountSession = useAccountSession();
  const accountId = accountSession.status === 'signed-in' ? accountSession.account.id : null;
  const [loaded, setLoaded] = useState<{ accountId: string; value: ManagementView } | null>(null);
  const [denied, setDenied] = useState<{
    accountId: string;
    reason: 'not-owner' | 'signed-out';
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const [managementError, setManagementError] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setRevision((value) => value + 1);
      router.refresh();
    };
    window.addEventListener(REGISTRATION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(REGISTRATION_CHANGED_EVENT, refresh);
  }, [router]);

  useEffect(() => {
    setLoaded(null);
    setDenied(null);
    setManagementError(false);
    if (!accountId) return;
    const controller = new AbortController();
    fetch(`/api/v1/agents/${encodeURIComponent(agentId)}/management-view`, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          // The session ended between the session check and this request.
          setDenied({ accountId, reason: 'signed-out' });
          window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
          return;
        }
        if (response.status === 403 || response.status === 404) {
          setDenied({ accountId, reason: 'not-owner' });
          return;
        }
        if (!response.ok) throw new Error('Management unavailable');
        const view = managementViewSchema.parse(await response.json());
        if (view.agent.id !== agentId) throw new Error('Invalid management response');
        if (!controller.signal.aborted) setLoaded({ accountId, value: view });
      })
      .catch(() => {
        if (!controller.signal.aborted) setManagementError(true);
      });
    return () => controller.abort();
  }, [agentId, accountId, revision]);

  const management =
    accountId && loaded?.accountId === accountId && loaded.value.agent.id === agentId
      ? loaded.value
      : null;
  const agent = management?.agent ?? null;
  const access: ManagementAccess =
    accountSession.status === 'loading'
      ? 'checking'
      : accountSession.status === 'signed-out'
        ? 'signed-out'
        : denied?.accountId === accountId
          ? denied.reason
          : managementError
            ? 'unavailable'
            : 'checking';
  const ownerAddress = agent?.ownerAddress ?? '';
  const payerAddress = agent?.walletAddress ?? ownerAddress;
  const hasSeparatePayer =
    Boolean(agent) && ownerAddress.toLowerCase() !== payerAddress.toLowerCase();
  const dns = management?.dns ?? [];
  const inbox = management?.inbox ?? null;
  const metadataUri = agent?.metadataUri;
  const metadataGateway = management?.publicConfig.metadataGateway.replace(/\/+$/, '');

  return (
    <main className="min-h-screen bg-background">
      <LandingNav />

      <section className="container max-w-6xl py-10 sm:py-12">
        <div className="mb-6 sm:mb-8">
          <Link
            href="/dashboard"
            className="inline-flex min-h-6 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </div>

        {management && agent ? (
          <>
            {/* Header */}
            <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar seed={agent.domain} />
                <div className="min-w-0">
                  <h1 className="wrap-anywhere text-2xl font-bold tracking-tight sm:text-3xl">
                    {agent.domain}
                  </h1>
                  {agent.basename && (
                    <div className="wrap-anywhere mt-1 font-mono text-sm text-muted-foreground">
                      {agent.basename}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={agent.status === 'active' ? 'success' : 'secondary'}>
                  {STATUS_LABELS[agent.status] ?? agent.status}
                </Badge>
                {agent.framework && <Badge variant="outline">{agent.framework}</Badge>}
              </div>
            </div>

            {/* Identity grid */}
            <div className="mb-8 grid grid-cols-1 gap-4 sm:mb-10 md:grid-cols-2">
              <InfoCard title="Domain" value={agent.domain} href={`https://${agent.domain}`} />
              {agent.basename && (
                <InfoCard
                  title="Basename"
                  value={agent.basename}
                  href={`https://www.base.org/name/${agent.basename.replace('.base.eth', '')}`}
                />
              )}
              {agent.ensName && <InfoCard title="ENS name" value={agent.ensName} />}
              {agent.agentIdNft !== null && (
                <InfoCard title="AgentID NFT" value={`#${agent.agentIdNft}`} />
              )}
              <InfoCard
                title="Owner"
                value={shortAddress(ownerAddress, 6)}
                href={`https://basescan.org/address/${ownerAddress}`}
              />
              {hasSeparatePayer && (
                <InfoCard
                  title="Payer"
                  value={shortAddress(payerAddress, 6)}
                  href={`https://basescan.org/address/${payerAddress}`}
                />
              )}
              {inbox && <InfoCard title="Email" value={inbox.emailAddress} />}
              <InfoCard title="Registered" value={formatDate(agent.createdAt)} />
              {agent.expiresAt && (
                <InfoCard
                  title="Expires"
                  value={`${formatDate(agent.expiresAt)} (${timeAgo(agent.expiresAt)})`}
                />
              )}
            </div>

            <ManagementSessionProvider signedIn={accountSession.status === 'signed-in'}>
              {/* Renewal Vault */}
              {agent.agentIdNft !== null && (
                <RenewalManagement
                  agentId={agent.id}
                  tokenId={agent.agentIdNft}
                  expiresAt={agent.expiresAt ? new Date(agent.expiresAt) : null}
                  ownerAddress={ownerAddress}
                  contractAddresses={{
                    usdc: management.publicConfig.usdc as `0x${string}`,
                    renewalVault: management.publicConfig.renewalVault as `0x${string}` | null,
                  }}
                  builderCode={management.publicConfig.builderCode}
                />
              )}

              {/* Plan */}
              <ServicePlanManagement agentId={agent.id} />

              {/* API Keys */}
              <ApiKeyManagement agentId={agent.id} />

              {/* Email Management */}
              <EmailManagement agentId={agent.id} inbox={inbox} />

              {/* DNS Management */}
              <DnsManagement agentId={agent.id} initialDns={dns} />

              {/* Metadata */}
              {metadataUri && (
                <Card className="premium-surface">
                  <CardContent className="p-4 sm:p-6">
                    <h2 className="font-semibold mb-3">Metadata</h2>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <code className="wrap-anywhere flex-1 text-xs font-mono text-muted-foreground">
                        {metadataUri}
                      </code>
                      <a
                        href={metadataUri.replace('ipfs://', `${metadataGateway}/`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="outline" size="sm" className="w-full sm:w-auto">
                          View
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              )}
            </ManagementSessionProvider>
          </>
        ) : (
          <OwnerManagementGate access={access} onRetry={() => setRevision((value) => value + 1)} />
        )}
      </section>

      <Footer />
    </main>
  );
}

function InfoCard({ title, value, href }: { title: string; value: string; href?: string }) {
  const content = (
    <Card className="interactive-surface premium-surface h-full min-h-[78px]">
      <CardContent className="flex min-h-[78px] flex-col justify-center p-4">
        <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm break-all">{value}</span>
          {href && <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
        </div>
      </CardContent>
    </Card>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return content;
}

/** A neutral monogram: the domain's first letter. */
function Avatar({ seed }: { seed: string }) {
  return (
    <div
      aria-hidden
      className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/60 text-2xl font-semibold uppercase text-foreground/80"
    >
      {seed.replace(/^www\./, '').charAt(0)}
    </div>
  );
}
