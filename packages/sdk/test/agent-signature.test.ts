import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { isHex, recoverMessageAddress } from 'viem';
import {
  OpenSignet,
  agentRequestBodySha256,
  agentSignatureAudience,
  buildAgentSignatureMessage,
  canonicalAgentRequestTarget,
  createAgentSignatureHeader,
} from '../dist/index.js';
import { bodyText, fake, headerRecord, requestUrl, type SdkWalletClient } from './helpers.ts';

const API = 'https://api.opensignet.com/api/v1';
const NONCE = '0123456789abcdef0123456789abcdef';
// Public deterministic test key, shared with the backend verifier's test vector.
const account = privateKeyToAccount(`0x${'01'.repeat(32)}`);
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Must stay byte-identical to services/backend/test/agent-signature.test.ts in the platform. */
const VECTOR: {
  url: string;
  body: string;
  timestamp: number;
  message: string;
  address: `0x${string}`;
  signature: `0x${string}`;
} = {
  url: `${API}/agents/7c9e6679-7425-40de-944b-e07fc1f90ae7/email/send?b=2&a=x%20y&a=1`,
  body: '{"to":"ops@example.com","subject":"Hi","text":"Hello"}',
  timestamp: 1793534400000,
  message: [
    'OpenSignet API request',
    'version: 2',
    'audience: opensignet.com',
    'method: POST',
    'target: /api/v1/agents/7c9e6679-7425-40de-944b-e07fc1f90ae7/email/send?a=1&a=x%20y&b=2',
    'body-sha256: 3a90c2606d84342cb4d1c3c299372326499cecf5eab9ba5e4f763ba617f17c3e',
    'timestamp: 1793534400000',
    `nonce: ${NONCE}`,
  ].join('\n'),
  address: '0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1',
  signature:
    '0x23de35d8e2f6df94fafa51f7b650012851b16cfc83209c2e558c4660d6bb05340d768f43f40b38579cbc6b1f6602104825ace407a5d8b06bbaa2882cbacc4cc11b',
};

function signer() {
  const messages: string[] = [];
  return {
    messages,
    address: account.address,
    signMessage: async (message: string) => {
      messages.push(message);
      return account.signMessage({ message });
    },
  };
}

describe('request-bound agent signature v2', () => {
  it('reproduces the shared backend vector byte for byte', async () => {
    const header = await createAgentSignatureHeader(
      signer(),
      { method: 'post', url: VECTOR.url, body: VECTOR.body },
      { timestamp: VECTOR.timestamp, nonce: NONCE },
    );
    assert.equal(account.address, VECTOR.address);
    assert.equal(header, `v2:${VECTOR.address}:${VECTOR.timestamp}:${NONCE}:${VECTOR.signature}`);
    assert.equal(
      await recoverMessageAddress({ message: VECTOR.message, signature: VECTOR.signature }),
      VECTOR.address,
    );
  });

  it('canonicalizes equivalent targets and hashes exact body bytes', () => {
    const plus = canonicalAgentRequestTarget(new URL(`${API}/x?q=a+b&z=1&a=%40`));
    assert.equal(plus, '/api/v1/x?a=%40&q=a%20b&z=1');
    assert.equal(canonicalAgentRequestTarget(new URL(`${API}/x?a=@&z=1&q=a%20b`)), plus);
    assert.equal(
      canonicalAgentRequestTarget(new URL(`${API}/a%27b/c?k=(v)*!`)),
      '/api/v1/a%27b/c?k=%28v%29%2A%21',
    );
    assert.equal(
      agentRequestBodySha256(VECTOR.body),
      createHash('sha256').update(VECTOR.body).digest('hex'),
    );
    assert.equal(agentRequestBodySha256(), createHash('sha256').update('').digest('hex'));
    assert.equal(
      agentRequestBodySha256(new TextEncoder().encode('é')),
      createHash('sha256').update('é').digest('hex'),
    );
  });

  it('binds the platform audience for every opensignet.com host only', () => {
    assert.equal(agentSignatureAudience('api.opensignet.com'), 'opensignet.com');
    assert.equal(agentSignatureAudience('opensignet.com'), 'opensignet.com');
    assert.equal(
      agentSignatureAudience('opensignet.com.evil.example'),
      'opensignet.com.evil.example',
    );
    assert.equal(agentSignatureAudience('localhost:3000'), 'localhost:3000');
  });

  it('rejects a malformed caller nonce', async () => {
    await assert.rejects(
      createAgentSignatureHeader(signer(), { method: 'GET', url: API }, { nonce: 'ABC' }),
      TypeError,
    );
  });

  it('signs each client request over its own method, target, body and nonce', async () => {
    const requests: { url: string; headers: Record<string, string | undefined>; body: string }[] =
      [];
    globalThis.fetch = async (url, init) => {
      requests.push({
        url: requestUrl(url),
        headers: headerRecord(init),
        body: bodyText(init),
      });
      return Response.json({ messageId: 'm', status: 'queued' });
    };
    const wallet = signer();
    const ad = new OpenSignet({
      walletClient: fake<SdkWalletClient>({
        account: { address: account.address },
        signMessage: ({ message }: { message: string }) => wallet.signMessage(message),
      }),
    });
    const args = { to: 'ops@example.com', subject: 'Hi', text: 'Hello' };
    await ad.sendEmail('agent-1', args);
    await ad.sendEmail('agent-1', args);
    assert.equal(requests.length, 2);
    const nonces = new Set<string>();
    for (const [index, request] of requests.entries()) {
      const header = request.headers['X-Agent-Signature'];
      assert.ok(header);
      const [version, address, timestamp, nonce, signature] = header.split(':');
      assert.ok(nonce !== undefined && isHex(signature));
      assert.equal(version, 'v2');
      assert.equal(address, account.address);
      nonces.add(nonce);
      const message = buildAgentSignatureMessage({
        audience: 'opensignet.com',
        method: 'POST',
        target: '/api/v1/agents/agent-1/email/send',
        bodySha256: createHash('sha256').update(request.body).digest('hex'),
        timestamp: Number(timestamp),
        nonce,
      });
      assert.equal(wallet.messages[index], message);
      assert.equal(await recoverMessageAddress({ message, signature }), account.address);
    }
    assert.equal(nonces.size, 2, 'every request uses a fresh nonce');
  });

  it('sends an API key instead of a signature unless the route requires the wallet', async () => {
    const requests: { url: string; headers: Record<string, string | undefined> }[] = [];
    globalThis.fetch = async (input, init) => {
      const url = requestUrl(input);
      requests.push({ url, headers: headerRecord(init) });
      return Response.json(url.endsWith('/keys') ? { id: 'k' } : { agentId: 'a' });
    };
    const wallet = signer();
    const ad = new OpenSignet({
      apiKey: 'agk_test_key',
      walletClient: fake<SdkWalletClient>({
        account: { address: account.address },
        signMessage: ({ message }: { message: string }) => wallet.signMessage(message),
      }),
    });
    await ad.getAgentById('a');
    await ad.createApiKey('a', 'ci');
    const [first, second] = requests;
    assert.ok(first && second);
    assert.equal(first.headers.Authorization, 'Bearer agk_test_key');
    assert.equal(first.headers['X-Agent-Signature'], undefined);
    assert.equal(second.headers.Authorization, undefined);
    assert.match(second.headers['X-Agent-Signature'] ?? '', /^v2:/);
    assert.match(wallet.messages[0] ?? '', /\nmethod: POST\ntarget: \/api\/v1\/keys\n/);
  });
});
