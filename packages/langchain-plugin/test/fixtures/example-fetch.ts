import assert from 'node:assert/strict';

// Test-process preload only: retain the SDK's default client while directing
// its public RPC HTTP request to the independently checked local fixture.
const fixtureRpc = process.env.LANGCHAIN_EXAMPLE_FIXTURE_RPC;
assert.ok(fixtureRpc, 'LANGCHAIN_EXAMPLE_FIXTURE_RPC is required');
const target = new URL(fixtureRpc);
assert.equal(target.protocol, 'http:');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.pathname, '/rpc');
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(input, init);
  assert.equal(new URL(request.url).origin, 'https://mainnet.base.org');
  assert.equal(new URL(request.url).pathname, '/');
  assert.equal(request.method, 'POST');
  return nativeFetch(new Request(target, request));
};
