import type { DashboardAgent } from './dashboard-client';
import type { AccountPlan } from '@/lib/account-plan';

/**
 * Sample data for reviewing the signed-in dashboard locally (`/dashboard?preview=1`) while the
 * backend is not running. The dashboard loads this module only from a development-only branch,
 * so production builds never include it.
 */
export interface DashboardPreview {
  address: string;
  balanceUsdc: string;
  plan: AccountPlan;
  agents: DashboardAgent[];
}

const day = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();

export const DASHBOARD_PREVIEW: DashboardPreview = {
  address: '0x5a1f00000000000000000000000000000000c0de',
  balanceUsdc: '1250.00',
  plan: {
    plan: 'pro',
    sku: 'pro',
    period: 'yearly',
    status: 'active',
    currentPeriodEnd: at(201),
    cancelAtPeriodEnd: false,
    paymentMethod: 'card',
  },
  agents: [
    {
      id: 'preview-research-agent',
      domain: 'research-agent.com',
      basename: 'research-agent.base.eth',
      ensName: null,
      agentIdNft: 1042,
      status: 'active',
      framework: 'langchain',
      createdAt: at(-120),
      expiresAt: at(245),
    },
    {
      id: 'preview-support-desk',
      domain: 'support-desk.ai',
      basename: null,
      ensName: 'support-desk.eth',
      agentIdNft: 1187,
      status: 'active',
      framework: 'agentkit',
      createdAt: at(-340),
      expiresAt: at(21),
    },
    {
      id: 'preview-trading-bot',
      domain: 'trading-bot.xyz',
      basename: 'trading-bot.base.eth',
      ensName: null,
      agentIdNft: 1203,
      status: 'provisioning',
      framework: null,
      createdAt: at(-1),
      expiresAt: at(364),
    },
  ],
};
