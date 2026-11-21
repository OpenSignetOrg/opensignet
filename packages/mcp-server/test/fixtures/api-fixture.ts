import assert from 'node:assert/strict';

// Test-process preload only: the real MCP server and SDK run, and only their HTTPS boundary to
// the OpenSignet API is replaced. Nothing reaches the network.
export const FIXTURE_AGENT = '11111111-1111-4111-8111-111111111111';
export const FIXTURE_KEY = `osk_${'fixture'.padEnd(43, '0')}`;
export const mode = process.env.OPENSIGNET_FIXTURE_MODE ?? process.argv[2] ?? 'ready';

const SECRETS =
  /^(?:AGENT_PRIVATE_KEY|RENEWAL_VAULT_ADDRESS|ALLOW_WRITES|NODE_OPTIONS|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|AUTOGEN_MODEL_CONFIG|NPM_TOKEN|AWS_.*|HTTPS?_PROXY)$/i;
for (const key of Object.keys(process.env)) {
  assert.doesNotMatch(key, SECRETS, `Unexpected sensitive child environment name: ${key}`);
}
assert.equal(process.env.OPENSIGNET_ENABLE_WRITE_TOOLS, 'false');
assert.equal(process.env.OPENSIGNET_API_URL, undefined, 'The API endpoint is never inherited');
const key = process.env.OPENSIGNET_API_KEY;
assert.ok(key === undefined || key === FIXTURE_KEY, 'Only the host-passed identity key arrives');

function renewal(agentId: string) {
  const ready = mode !== 'not-ready';
  return {
    agentId,
    domain: 'reader.xyz',
    status: 'active',
    expiresAt: '2027-11-21T00:00:00Z',
    autoRenew: true,
    method: 'wallet',
    price: '10440000',
    chargeWindow: { opensAt: '2027-10-22T00:00:00Z', closesAt: '2027-11-14T00:00:00Z' },
    wallet: {
      address: '0x1111111111111111111111111111111111111111',
      balance: ready ? '20000000' : '0',
      approved: true,
    },
    cardSaved: false,
    ready,
    issue: ready
      ? null
      : {
          code: 'wallet_balance_low',
          message:
            'The OpenSignet wallet holds less USDC than the renewal costs. Add USDC before the renewal is due.',
        },
  };
}

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const authorization = request.headers.get('authorization');
  console.error(
    `FIXTURE_API ${JSON.stringify({ pid: process.pid, mode, method: request.method, path: url.pathname, authorized: authorization !== null })}`,
  );
  assert.equal(url.origin, 'https://api.opensignet.com', 'Only the default API is used');
  assert.equal(request.method, 'GET', 'Read-only tools never write');
  if (mode === 'api-error') {
    return Response.json({ code: 'UNAVAILABLE', message: 'Fixture unavailable' }, { status: 503 });
  }
  if (url.pathname === '/api/v1/domains/availability') {
    assert.equal(authorization, null, 'Availability is public and carries no credential');
    const name = url.searchParams.get('name');
    const tld = url.searchParams.get('tld');
    return Response.json({
      available: name !== 'taken',
      domain: `${name}.${tld}`,
      priceUsdc: '10.44',
    });
  }
  const agent = /^\/api\/v1\/agents\/([^/]+)\/renewal$/.exec(url.pathname)?.[1];
  if (agent !== undefined) {
    if (authorization !== `Bearer ${FIXTURE_KEY}`) {
      return Response.json(
        { code: 'UNAUTHENTICATED', message: 'Sign in or send an API key.' },
        { status: 401 },
      );
    }
    return Response.json(
      renewal(mode === 'other-agent' ? '22222222-2222-4222-8222-222222222222' : agent),
    );
  }
  return Response.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });
};
