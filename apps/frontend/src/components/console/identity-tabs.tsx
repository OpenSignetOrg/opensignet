'use client';

import { ArrowUpRight } from 'lucide-react';
import { ApiKeyManagement } from '@/components/agents/api-key-management';
import { DnsManagement } from '@/components/agents/dns-management';
import { EmailManagement } from '@/components/agents/email-management';
import { RenewalManagement } from '@/components/agents/renewal-management';
import { ServicePlanManagement } from '@/components/agents/service-plan-management';
import { formatDate, shortAddress, timeAgo } from '@/lib/utils';
import { useIdentity } from './identity-shell';

export function IdentityEmailTab() {
  const { view } = useIdentity();
  return <EmailManagement agentId={view.agent.id} domain={view.agent.domain} inbox={view.inbox} />;
}

export function IdentityDnsTab() {
  const { view } = useIdentity();
  return <DnsManagement agentId={view.agent.id} initialDns={view.dns} />;
}

export function IdentityKeysTab() {
  const { view } = useIdentity();
  return <ApiKeyManagement agentId={view.agent.id} />;
}

/** Everything about the identity itself: names, ownership, dates, plan limits and metadata. */
export function IdentityDetailsTab() {
  const { view } = useIdentity();
  const { agent, publicConfig } = view;
  const owner = agent.ownerAddress;
  const payer = agent.walletAddress ?? owner;
  const gateway = publicConfig.metadataGateway.replace(/\/+$/, '');

  const rows: { label: string; value: string; href?: string; mono?: boolean }[] = [
    { label: 'Domain', value: agent.domain, href: `https://${agent.domain}` },
    ...(agent.basename
      ? [
          {
            label: 'Basename',
            value: agent.basename,
            href: `https://www.base.org/name/${agent.basename.replace('.base.eth', '')}`,
          },
        ]
      : []),
    ...(agent.ensName ? [{ label: 'ENS name', value: agent.ensName }] : []),
    ...(agent.agentIdNft !== null ? [{ label: 'AgentID', value: `#${agent.agentIdNft}` }] : []),
    {
      label: 'Owner wallet',
      value: shortAddress(owner, 6),
      href: `https://basescan.org/address/${owner}`,
      mono: true,
    },
    ...(payer.toLowerCase() !== owner.toLowerCase()
      ? [
          {
            label: 'Payer wallet',
            value: shortAddress(payer, 6),
            href: `https://basescan.org/address/${payer}`,
            mono: true,
          },
        ]
      : []),
    ...(agent.framework ? [{ label: 'Framework', value: agent.framework }] : []),
    { label: 'Registered', value: formatDate(agent.createdAt) },
    ...(agent.expiresAt
      ? [{ label: 'Renews', value: `${formatDate(agent.expiresAt)} · ${timeAgo(agent.expiresAt)}` }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="identity-details" className="console-card overflow-hidden">
        <h2
          id="identity-details"
          className="border-b border-border/60 px-5 py-4 text-[15px] font-semibold sm:px-6"
        >
          Identity
        </h2>
        <dl className="grid gap-px bg-border/60 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex min-w-0 flex-col gap-1 bg-[hsl(var(--console-surface))] px-5 py-4 sm:px-6 sm:[&:last-child:nth-child(odd)]:col-span-2"
            >
              <dt className="text-[12px] font-medium text-muted-foreground">{row.label}</dt>
              <dd className={row.mono ? 'font-mono text-[13px]' : 'text-[14px]'}>
                {row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex max-w-full items-center gap-1 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <span className="truncate">{row.value}</span>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </a>
                ) : (
                  <span className="wrap-anywhere">{row.value}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <ServicePlanManagement agentId={agent.id} />

      {agent.agentIdNft !== null ? (
        <RenewalManagement
          agentId={agent.id}
          tokenId={agent.agentIdNft}
          expiresAt={agent.expiresAt ? new Date(agent.expiresAt) : null}
          ownerAddress={owner}
          contractAddresses={{
            usdc: publicConfig.usdc as `0x${string}`,
            renewalVault: publicConfig.renewalVault as `0x${string}` | null,
          }}
          builderCode={publicConfig.builderCode}
        />
      ) : null}

      {agent.metadataUri ? (
        <section aria-labelledby="identity-metadata" className="console-card px-5 py-4 sm:px-6">
          <h2 id="identity-metadata" className="text-[15px] font-semibold">
            Metadata
          </h2>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <code className="wrap-anywhere text-xs text-muted-foreground">{agent.metadataUri}</code>
            <a
              href={agent.metadataUri.replace('ipfs://', `${gateway}/`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border/90 px-3 text-[13px] font-medium hover:bg-background"
            >
              View
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </a>
          </div>
        </section>
      ) : null}
    </div>
  );
}
