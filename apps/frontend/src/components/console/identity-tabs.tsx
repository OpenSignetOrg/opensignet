'use client';

import { ApiKeyManagement } from '@/components/agents/api-key-management';
import { DnsManagement } from '@/components/agents/dns-management';
import { EmailManagement } from '@/components/agents/email-management';
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
