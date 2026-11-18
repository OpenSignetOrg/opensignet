import type { Metadata } from 'next';
import { AgentDetailClient } from '@/components/agents/agent-detail-client';
import { createPageMetadata } from '@/lib/seo';

/** An identity's settings. Private: shown only to the signed-in account that owns it. */
export const metadata: Metadata = createPageMetadata({
  title: 'Identity',
  description: 'Manage the domain, DNS, email, renewal and API keys of one of your identities.',
  path: '/dashboard',
  index: false,
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function IdentityPage({ params }: PageProps) {
  const { id } = await params;
  return <AgentDetailClient agentId={id} />;
}
