import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { OpenSignetActionProvider } from '../dist/index.js';
import { actionNamed } from './actions.ts';
import { registrationResultSchema } from '@opensignet/shared';

const owner = '0x1111111111111111111111111111111111111111';
const agentId = '22222222-2222-4222-8222-222222222222';
const apiUrl = 'https://example.test/api/v1';
const apiKey = 'osk_agentkit_fixture';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const walletProvider = {
  getAddress: () => owner,
  signMessage: async () => `0x${'11'.repeat(65)}`,
  sendTransaction: async () => {
    throw new Error('renewal never needs a wallet transaction');
  },
};

describe('AgentKit renewal actions', () => {
  it('registers with automatic renewal handled by OpenSignet, without any wallet transaction', async () => {
    let sent: { autoRenew?: unknown } | undefined;
    globalThis.fetch = async (input, init = {}) => {
      assert.ok(String(input).endsWith('/agents/register'), String(input));
      sent = JSON.parse(String(init.body));
      return json(
        registrationResultSchema.parse({
          registrationId: '11111111-1111-4111-8111-111111111111',
          agentId,
          domain: 'renews.xyz',
          nftTokenId: 7,
          basename: null,
          ensName: null,
          txHash: `0x${'ab'.repeat(32)}`,
          estimatedReadyAt: '2026-11-22T00:00:00.000Z',
          metadataUri: 'ipfs://synthetic-registration-fixture',
          provisioningStatus: 'completed',
        }),
      );
    };
    const provider = new OpenSignetActionProvider({ apiUrl });
    const result = await actionNamed(provider, 'register_agent_identity').invoke(walletProvider, {
      preferredName: 'renews',
      tld: 'xyz',
      autoRenew: true,
    });
    assert.equal(sent?.autoRenew, true);
    assert.match(result, /^Registered renews\.xyz\. It renews automatically each year/);
  });

  it('describes the renewal and the first thing in the way, in words', async () => {
    let request: { url: string; authorization: string | null } | undefined;
    globalThis.fetch = async (input, init = {}) => {
      request = {
        url: String(input),
        authorization: new Headers(init.headers).get('Authorization'),
      };
      return json({
        agentId,
        domain: 'renews.xyz',
        status: 'active',
        expiresAt: '2027-11-21T00:00:00Z',
        autoRenew: true,
        method: 'wallet',
        price: '79000000',
        chargeWindow: { opensAt: '2027-10-22T00:00:00Z', closesAt: '2027-11-14T00:00:00Z' },
        wallet: { address: owner, balance: '0', approved: true },
        cardSaved: false,
        ready: false,
        issue: {
          code: 'wallet_balance_low',
          message: 'The OpenSignet wallet holds less USDC than the renewal costs.',
        },
      });
    };
    const provider = new OpenSignetActionProvider({ apiUrl, apiKey });
    const result = await actionNamed(provider, 'get_renewal_status').invoke(walletProvider, {
      agentId,
    });
    assert.deepEqual(request, {
      url: `${apiUrl}/agents/${agentId}/renewal`,
      authorization: `Bearer ${apiKey}`,
    });
    assert.equal(
      result,
      'renews.xyz renews automatically from the OpenSignet wallet ($79.00 a year), expires 2027-11-21T00:00:00Z. The OpenSignet wallet holds less USDC than the renewal costs.',
    );
  });

  it('switches renewal on and off through the API', async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input, init = {}) => {
      calls.push(`${init.method ?? 'GET'} ${String(input)}`);
      return json({ domain: 'renews.xyz', autoRenew: !String(input).endsWith('/off') });
    };
    const provider = new OpenSignetActionProvider({ apiUrl, apiKey });
    const action = actionNamed(provider, 'set_auto_renew');
    assert.throws(() => action.schema.parse({ agentId, enabled: 'yes' }));
    assert.match(
      await action.invoke(walletProvider, { agentId, enabled: false }),
      /no longer renews/,
    );
    assert.match(await action.invoke(walletProvider, { agentId, enabled: true }), /now renews/);
    assert.deepEqual(calls, [
      `POST ${apiUrl}/agents/${agentId}/domain/auto-renew/off`,
      `POST ${apiUrl}/agents/${agentId}/domain/auto-renew`,
    ]);
  });

  it('offers no vault actions any more', () => {
    const names = new OpenSignetActionProvider().getActions().map((action) => action.name);
    for (const retired of ['fund_renewal_vault', 'enable_auto_renew', 'withdraw_renewal_vault']) {
      assert.ok(!names.includes(retired), retired);
    }
  });
});
