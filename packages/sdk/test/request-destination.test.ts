import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { OpenSignet } from '../dist/index.js';
import { fake, jsonBody, requestUrl, type SdkWalletClient } from './helpers.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const apiUrl = 'https://custom.example.test/prefix/api/v1';
const payer = '0x1111111111111111111111111111111111111111';
const signature = `0x${'ab'.repeat(65)}`;
const walletClient = fake<SdkWalletClient>({
  account: { address: payer },
  signTypedData: async () => signature,
});
const fixture = {
  available: true,
  inbox: {},
  addresses: [],
  address: {
    id: 'alias',
    agentId: 'agent',
    emailAddress: 'alias@example.test',
    kind: 'alias',
    status: 'active',
    createdAt: '2026-10-13T00:00:00.000Z',
    updatedAt: '2026-10-13T00:00:00.000Z',
  },
  messages: [],
  message: 'Updated',
  deleted: true,
  data: '0x',
  keys: [],
};

// Each reported index.ts sink is covered here; funding's second sink is exercised below.
type Flow = [
  name: string,
  invoke: (ad: OpenSignet, id: string) => Promise<unknown>,
  suffix: string,
  method: string,
];
const flows: Flow[] = [
  [
    'availability',
    (ad, id) => ad.checkAvailability(id, { tld: id }),
    '/domains/availability',
    'GET',
  ],
  ['send', (ad, id) => ad.sendEmail(id, { to: id, subject: id, text: id }), '/email/send', 'POST'],
  ['batch', (ad, id) => ad.sendEmailBatch(id, { messages: [] }), '/email/batch', 'POST'],
  ['webhook', (ad, id) => ad.setEmailWebhook(id, { url: id }), '/email/webhook', 'PUT'],
  ['rename', (ad, id) => ad.updatePrimaryEmail(id, 'alias'), '/email', 'PATCH'],
  ['alias create', (ad, id) => ad.createEmailAlias(id, 'alias'), '/email/aliases', 'POST'],
  ['alias delete', (ad, id) => ad.deleteEmailAlias(id, id), '/email/aliases', 'DELETE'],
  ['list mail', (ad, id) => ad.listEmail(id), '/email', 'GET'],
  ['delete mail', (ad, id) => ad.deleteEmailMessage(id, id), '/email/:id', 'DELETE'],
  [
    'DNS create',
    (ad, id) => ad.createDnsRecord(id, { type: 'A', name: '@', value: id }),
    '/dns',
    'POST',
  ],
  ['DNS update', (ad, id) => ad.updateDnsRecord(id, id, {}), '/dns/:id', 'PATCH'],
  ['DNS delete', (ad, id) => ad.deleteDnsRecord(id, id), '/dns/:id', 'DELETE'],
  ['DNS export', (ad, id) => ad.exportDnsZone(id), '/dns/export', 'GET'],
  ['DNS batch', (ad, id) => ad.previewDnsBatch(id, []), '/dns/batch', 'POST'],
  ['DNS import', (ad, id) => ad.previewDnsImport(id, id), '/dns/import', 'POST'],
  ['agent read', (ad, id) => ad.getAgentById(id), '', 'GET'],
  ['DNS read', (ad, id) => ad.listDnsRecords(id), '/dns', 'GET'],
  ['DNS capabilities', (ad, id) => ad.getDnsCapabilities(id), '/dns/capabilities', 'GET'],
  ['mail usage', (ad, id) => ad.getEmailUsage(id), '/email/usage', 'GET'],
  ['webhook read', (ad, id) => ad.getEmailWebhook(id), '/email/webhook', 'GET'],
  ['webhook rotate', (ad, id) => ad.rotateEmailWebhookSecret(id), '/email/webhook', 'PATCH'],
  ['plan read', (ad, id) => ad.getServicePlan(id), '/plan', 'GET'],
  ['domain read', (ad, id) => ad.getDomain(id), '/domain', 'GET'],
  ['renewal read', (ad, id) => ad.getRenewal(id), '/renewal', 'GET'],
  ['message read', (ad, id) => ad.setEmailRead(id, id, true), '/email/:id', 'PATCH'],
  ['renewal on', (ad, id) => ad.setAutoRenew(id, true), '/domain/auto-renew', 'POST'],
  ['renewal off', (ad, id) => ad.setAutoRenew(id, false), '/domain/auto-renew/off', 'POST'],
];

for (const [name, invoke, suffix, method] of flows) {
  test(`${name}: untrusted data cannot change the configured origin or escape its path segment`, async () => {
    for (const id of [
      'https://169.254.169.254/latest?x=1#fragment',
      '../../admin',
      '//evil.test\\route',
      '%2e%2e%2fadmin',
      'ordinary-id',
    ]) {
      let calls = 0;
      globalThis.fetch = async (input, init = {}) => {
        calls++;
        const url = new URL(requestUrl(input));
        const encoded = encodeURIComponent(id);
        assert.equal(url.origin, new URL(apiUrl).origin);
        assert.equal(url.hash, '');
        assert.equal(init.method ?? 'GET', method);
        assert.equal(
          url.pathname,
          '/prefix/api/v1' +
            (name === 'availability'
              ? suffix
              : `/agents/${encoded}${suffix.replace(':id', encoded)}`),
        );
        if (name === 'availability') {
          assert.equal(url.searchParams.get('name'), id);
          assert.equal(url.searchParams.get('tld'), id);
        } else {
          assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer fixture');
        }
        if (name === 'alias delete') assert.equal(url.searchParams.get('emailAddress'), id);
        if (name === 'webhook') assert.equal(jsonBody(init).url, id);
        return Response.json(fixture);
      };
      await invoke(new OpenSignet({ apiUrl, apiKey: 'fixture', walletClient }), id);
      assert.equal(calls, 1);
    }
  });
}

test('constructor configuration preserves custom prefixes and every documented local HTTP host', async () => {
  for (const base of [
    apiUrl,
    'http://localhost:3000/api/v1',
    'http://127.0.0.1:3000/api/v1',
    'http://[::1]:3000/api/v1',
  ]) {
    const options = { apiUrl: base + '/' };
    const ad = new OpenSignet(options);
    options.apiUrl = 'https://evil.test';
    globalThis.fetch = async (url) => {
      assert.equal(
        new URL(requestUrl(url)).href,
        `${base}/domains/availability?name=agent&tld=xyz`,
      );
      return Response.json(fixture);
    };
    await ad.checkAvailability('agent', { tld: 'xyz' });
  }
});

test('wallet and key identifiers are encoded without enabling API-key authentication on owner routes', async () => {
  const id = '../../admin?x=1#fragment';
  const ad = new OpenSignet({ apiUrl, apiKey: 'must-not-be-sent' });
  const paths = [`/agents/by-wallet/${encodeURIComponent(id)}`, `/keys/${encodeURIComponent(id)}`];
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, apiUrl + paths[calls++]);
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    return Response.json(fixture);
  };
  // Untyped JavaScript callers can pass any string as the wallet address.
  await ad.getAgentsByWallet(id as `0x${string}`);
  await ad.revokeApiKey(id);
  assert.equal(calls, 2);
});

test('DNS export scope stays a single query value even for untyped JavaScript callers', async () => {
  const scope = 'user&other=1#fragment';
  globalThis.fetch = async (input) => {
    const url = new URL(requestUrl(input));
    assert.equal(url.searchParams.get('scope'), scope);
    assert.equal(url.searchParams.has('other'), false);
    assert.equal(url.hash, '');
    return new Response('zone');
  };
  // The scope parameter is typed; untyped JavaScript callers can still pass any string.
  const untypedScope = scope as Parameters<OpenSignet['exportDnsZone']>[1];
  assert.equal(await new OpenSignet({ apiUrl }).exportDnsZone('agent', untypedScope), 'zone');
});

test('dot-only agent, message, DNS and registration identifiers are rejected before fetch', async () => {
  globalThis.fetch = () => assert.fail('Dot segments must never reach fetch');
  const ad = new OpenSignet({
    apiUrl,
    apiKey: 'fixture',
    registrationAuth: 'session',
    registrationExpectedPayer: payer,
  });
  for (const id of ['.', '..']) {
    await assert.rejects(ad.getAgentById(id), /dot segments/);
    await assert.rejects(ad.deleteEmailMessage('agent', id), /dot segments/);
    await assert.rejects(ad.deleteDnsRecord('agent', id), /dot segments/);
    await assert.rejects(ad.getRegistration(id), /dot segments/);
  }
});

test('registration read uses the trusted base, encoded ID, payer binding and redirect rejection', async () => {
  const id = 'https://169.254.169.254/metadata?x=1#fragment';
  globalThis.fetch = async (input, init) => {
    const url = new URL(requestUrl(input));
    assert.equal(url.origin, new URL(apiUrl).origin);
    assert.equal(url.pathname, `/prefix/api/v1/registrations/${encodeURIComponent(id)}`);
    assert.equal(url.searchParams.get('expectedPayer'), payer);
    assert.equal(init?.credentials, 'include');
    assert.equal(init?.redirect, 'error');
    return Response.json({}, { status: 404 });
  };
  const ad = new OpenSignet({
    apiUrl,
    registrationAuth: 'session',
    registrationExpectedPayer: payer,
  });
  await assert.rejects(ad.getRegistration(id), /HTTP 404/);
});
