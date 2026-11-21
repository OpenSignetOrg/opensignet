import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import {
  OpenSignet,
  agentRequestBodySha256,
  agentSignatureAudience,
  buildAgentSignatureMessage,
  canonicalAgentRequestTarget,
} from '@opensignet/sdk';
import { createWalletClient, custom, recoverMessageAddress, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { ToolInputParsingException } from '@langchain/core/tools';
import { createOpenSignetTools } from '../dist/index.js';
const agentId = '11111111-1111-4111-8111-111111111111';
const registrationId = '22222222-2222-4222-8222-222222222222';
const other = '0x2222222222222222222222222222222222222222';
import { closeServer, invokeUntyped, serverPort, toolNamed } from './support.ts';

process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';

// A disposable local signer verifies real SDK API authentication. It is never
// persisted, funded, printed, or used to send a transaction.
const account = privateKeyToAccount(generatePrivateKey());
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: custom({ request: async () => assert.fail('Wallet RPC is forbidden') }),
}).extend(() => ({
  signTypedData: async () => assert.fail('Typed-data signing is forbidden'),
  sendTransaction: async () => assert.fail('Transaction submission is forbidden'),
}));
const fixtureKey = 'local-fixture-api-value';
const nativeFetch = globalThis.fetch;
let server: Server;
let apiUrl: string;
let mode = 'ok';
let requests: Array<{ method: string | undefined; pathname: string }> = [];
const violations: unknown[] = [];
const renewal = {
  agentId,
  domain: 'reader.example',
  status: 'active',
  expiresAt: '2027-11-21T00:00:00Z',
  autoRenew: true,
  method: 'wallet',
  price: '10440000',
  chargeWindow: { opensAt: '2027-10-22T00:00:00Z', closesAt: '2027-11-14T00:00:00Z' },
  wallet: { address: other, balance: '20000000', approved: true },
  cardSaved: false,
  ready: true,
  issue: null,
};

before(async () => {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(String(request.url), apiUrl);
      requests.push({ method: request.method, pathname: url.pathname });
      const switching = url.pathname.startsWith(`/api/v1/agents/${agentId}/domain/auto-renew`);
      assert.equal(request.method, switching ? 'POST' : 'GET', 'Only the renewal switch writes');
      assert.equal(request.headers['payment-signature'], undefined);
      assert.equal(request.headers['x-payment'], undefined);
      if (mode === 'denied') {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'synthetic-secret-auth-error' }));
        return;
      }
      if (url.pathname === `/api/v1/agents/${agentId}/renewal`) {
        assert.equal(request.headers.authorization, `Bearer ${fixtureKey}`);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(renewal));
        return;
      }
      if (url.pathname === `/api/v1/agents/${agentId}/domain/auto-renew/off`) {
        assert.equal(request.headers.authorization, `Bearer ${fixtureKey}`);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ domain: 'reader.example', autoRenew: false }));
        return;
      }
      if (url.pathname === `/api/v1/agents/${agentId}/domain/auto-renew`) {
        response.writeHead(409, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            code: 'RENEWAL_APPROVAL_REQUIRED',
            message: 'synthetic-detail-not-shown',
            details: {},
          }),
        );
        return;
      }
      if (url.pathname === `/api/v1/agents/${agentId}`) {
        assert.equal(request.headers.authorization, `Bearer ${fixtureKey}`);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            id: agentId,
            domain: 'reader.example',
            status: 'active',
            walletAddress: account.address,
            ownerAddress: account.address,
          }),
        );
        return;
      }
      assert.equal(url.pathname, `/api/v1/registrations/${registrationId}`);
      assert.equal(
        request.headers.authorization,
        undefined,
        'Registration does not use the ordinary API key',
      );
      assert.equal(url.searchParams.get('expectedPayer'), account.address.toLowerCase());
      const header = request.headers['x-agent-signature'];
      assert.ok(typeof header === 'string');
      const parts = header.split(':');
      assert.equal(parts.length, 5);
      const [version, claimed, issued, nonce, signature] = parts as [
        string,
        string,
        string,
        string,
        Hex,
      ];
      assert.equal(version, 'v2');
      // Rebuild from the URL this server actually received, as the API does.
      const recovered = await recoverMessageAddress({
        message: buildAgentSignatureMessage({
          audience: agentSignatureAudience(url.host),
          method: request.method,
          target: canonicalAgentRequestTarget(url),
          bodySha256: agentRequestBodySha256(),
          timestamp: Number(issued),
          nonce,
        }),
        signature,
      });
      assert.equal(recovered, account.address);
      assert.equal(claimed, account.address.toLowerCase());
      const body = {
        registrationId: mode === 'wrong-registration' ? agentId : registrationId,
        status: 'processing',
        statusUrl: `${apiUrl}/registrations/${registrationId}`,
        domain: 'reader.example',
        paymentStatus: 'settled',
        pollAfterSeconds: 5,
        agentId: null,
        stage: 'domain',
        messageCode: 'REGISTRATION_PROCESSING',
        startedAt: '2026-09-13T00:00:00.000Z',
        updatedAt: '2026-09-13T00:00:00.000Z',
        completedAt: null,
        revision: 1,
        estimatedDurationSeconds: null,
        completionEventId: null,
      };
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Authenticated-Wallet': mode === 'wrong-payer' ? other : account.address,
      });
      response.end(JSON.stringify(body));
    } catch (error) {
      violations.push(error);
      response.writeHead(500);
      response.end('Fixture assertion failed');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  apiUrl = `http://127.0.0.1:${serverPort(server)}/api/v1`;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(new URL(new Request(input, init).url).origin, new URL(apiUrl).origin);
    return nativeFetch(input, init);
  };
});
beforeEach(() => {
  requests = [];
  mode = 'ok';
});
afterEach(() => {
  assert.deepEqual(violations, []);
});
after(async () => {
  globalThis.fetch = nativeFetch;
  await closeServer(server);
});

function configured(
  apiClient = new OpenSignet({ apiUrl, apiKey: fixtureKey, walletClient }),
  allowRenewalChanges = false,
) {
  return createOpenSignetTools({ apiClient, allowRenewalChanges });
}

describe('explicit API opt-in with real SDK and authenticated HTTP', () => {
  it('reads the renewal with the identity’s key and reports it unchanged', async () => {
    const result = await toolNamed(configured(), 'get_renewal_status').invoke({ agentId });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, renewal);
    assert.deepEqual(requests, [{ method: 'GET', pathname: `/api/v1/agents/${agentId}/renewal` }]);
  });

  it('offers the renewal switch only when the host allows changes', () => {
    assert.ok(!configured().some((candidate) => candidate.name === 'set_auto_renew'));
    assert.ok(configured(undefined, true).some((candidate) => candidate.name === 'set_auto_renew'));
    assert.deepEqual(requests, []);
  });

  it('switches renewal off, and explains the owner approval it needs to turn on', async () => {
    const tools = configured(undefined, true);
    const off = await toolNamed(tools, 'set_auto_renew').invoke({ agentId, enabled: false });
    assert.equal(off.ok, true);
    assert.equal(off.data.autoRenew, false);
    const on = await toolNamed(tools, 'set_auto_renew').invoke({ agentId, enabled: true });
    assert.equal(on.ok, false);
    assert.equal(on.error.code, 'RENEWAL_APPROVAL_REQUIRED');
    assert.match(on.error.message, /owner’s approval once/);
    assert.doesNotMatch(JSON.stringify(on), /synthetic-detail-not-shown|HTTP 409/);
    await assert.rejects(
      invokeUntyped(toolNamed(tools, 'set_auto_renew'), { agentId, enabled: 'yes' }),
      ToolInputParsingException,
    );
    assert.deepEqual(requests, [
      { method: 'POST', pathname: `/api/v1/agents/${agentId}/domain/auto-renew/off` },
      { method: 'POST', pathname: `/api/v1/agents/${agentId}/domain/auto-renew` },
    ]);
  });

  it('performs an authenticated lookup without embedding client credentials in the tool or result', async () => {
    const lookup = toolNamed(configured(), 'lookup_agent');
    assert.doesNotMatch(
      JSON.stringify(lookup.toJSON()),
      /local-fixture-api-value|walletClient|privateKey/,
    );
    const result = await lookup.invoke({ agentId });
    assert.equal(result.ok, true);
    assert.equal(result.data.domain, 'reader.example');
    assert.equal(result.data.id, agentId);
    assert.doesNotMatch(JSON.stringify(result), /local-fixture-api-value|x-agent-signature/i);
    assert.deepEqual(requests, [{ method: 'GET', pathname: `/api/v1/agents/${agentId}` }]);
  });

  it('authenticates a registration read with real signMessage, never a payment or transaction', async () => {
    const read = toolNamed(configured(), 'get_registration_status');
    const result = await read.invoke({ registrationId });
    assert.equal(result.ok, true);
    assert.equal(result.data.registrationId, registrationId);
    assert.equal(result.data.status, 'processing');
    assert.equal(requests.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(requests.length, 1, 'No polling or recovery loop');
  });

  it('does not pretend an API key alone supplies registration payer authentication', async () => {
    const read = toolNamed(
      configured(new OpenSignet({ apiUrl, apiKey: fixtureKey })),
      'get_registration_status',
    );
    const result = await read.invoke({ registrationId });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'API_UNAVAILABLE');
    assert.equal(requests.length, 0);
  });

  for (const scenario of ['denied', 'wrong-payer', 'wrong-registration']) {
    it(`does not bypass or reinterpret ${scenario} as confirmed status`, async () => {
      mode = scenario;
      const result = await toolNamed(configured(), 'get_registration_status').invoke({
        registrationId,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'API_UNAVAILABLE');
      assert.doesNotMatch(
        JSON.stringify(result),
        /synthetic-secret-auth-error|local-fixture-api-value/,
      );
      assert.equal(requests.length, 1);
    });
  }

  it('rejects model-supplied endpoints and invalid identifiers before HTTP', async () => {
    const lookup = toolNamed(configured(), 'lookup_agent');
    await assert.rejects(lookup.invoke({ agentId: '../../keys' }), ToolInputParsingException);
    await assert.rejects(
      invokeUntyped(lookup, { agentId, apiUrl: 'https://untrusted.example.invalid' }),
      ToolInputParsingException,
    );
    await assert.rejects(
      invokeUntyped(lookup, { agentId, apiKey: 'not-allowed' }),
      ToolInputParsingException,
    );
    assert.equal(requests.length, 0);
  });
});
