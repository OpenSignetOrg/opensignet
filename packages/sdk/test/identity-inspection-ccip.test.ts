import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import {
  createPublicClient,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  http,
  multicall3Abi,
  parseAbi,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import {
  AGENT_IDENTITY_REGISTRY_BASE as registry,
  IdentityInspectionError,
} from '../dist/index.js';
// The renewal workflow uses this read internally; it is not a public export.
import { IDENTITY_INSPECTION_ABI, inspectAgentIdentity } from '../dist/identity-inspection.js';
import type { EthCall, JsonRpcRequest } from './helpers.ts';

const rpcOrigin = 'https://mainnet.base.org';
const multicall = '0xca11bde05977b3631167028862be2a173976ca11';
const blockNumber = '0x2faf080';
const blockHash: Hex = `0x${'ab'.repeat(32)}`;
const callback = '0x11223344';
const gatewayUrls = [
  'http://127.0.0.1:12345/identity-review-probe',
  'https://offchain.example.invalid/{sender}/{data}',
];
const offchainAbi = parseAbi([
  'error OffchainLookup(address sender,string[] urls,bytes callData,bytes4 callbackFunction,bytes extraData)',
]);

function interceptEveryFetch(t: TestContext, mode: string) {
  const offchain = encodeErrorResult({
    abi: offchainAbi,
    errorName: 'OffchainLookup',
    args: [
      mode === 'aggregate-rpc-revert' ? multicall : registry,
      gatewayUrls,
      '0x01',
      callback,
      '0x',
    ],
  });
  const requests: { url: string; method: string }[] = [],
    contractCalls: Hex[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, method: request.method });
    // Never forward even an unexpected request to the real network. A synthetic
    // successful gateway reply also detects forbidden follow-up callback RPCs.
    if (new URL(request.url).origin !== rpcOrigin) {
      return Response.json({ data: '0x' });
    }
    assert.equal(request.method, 'POST');
    for (const header of request.headers.keys()) {
      assert.doesNotMatch(header, /authorization|cookie|api.key|signature|payment/i);
    }
    const rpc: JsonRpcRequest = await request.json();
    let result: unknown;
    if (rpc.method === 'eth_chainId') result = '0x2105';
    else if (rpc.method === 'eth_getBlockByNumber') {
      assert.equal(rpc.params[0], 'safe');
      result = {
        number: blockNumber,
        hash: blockHash,
        timestamp: '0x3e8',
        transactions: [],
      };
    } else {
      assert.equal(rpc.method, 'eth_call');
      assert.deepEqual(rpc.params[1], { blockHash, requireCanonical: true });
      const ethCall = rpc.params[0] as EthCall;
      assert.equal(ethCall.from, undefined);
      assert.equal(ethCall.value, undefined);
      const target = ethCall.to.toLowerCase();
      if (target === registry.toLowerCase()) {
        contractCalls.push(ethCall.data);
        const call = decodeFunctionData({ abi: IDENTITY_INSPECTION_ABI, data: ethCall.data });
        assert.equal(call.functionName, 'getIdentity');
        if (mode.startsWith('aggregate'))
          result = encodeFunctionResult({
            abi: IDENTITY_INSPECTION_ABI,
            functionName: 'getIdentity',
            result: {
              owner: `0x${'11'.repeat(20)}`,
              domain: 'fixture.example',
              basename: '',
              ensName: '',
              metadataUri: 'ipfs://fixture-not-fetched',
              createdAt: 500n,
              expiresAt: 2000n,
              revoked: false,
            },
          });
      } else {
        assert.equal(target, multicall);
        const batch = decodeFunctionData({ abi: multicall3Abi, data: ethCall.data });
        assert.equal(batch.functionName, 'aggregate3');
        for (const call of batch.args[0]) {
          assert.equal(call.target.toLowerCase(), registry.toLowerCase());
          assert.equal(call.allowFailure, true);
          contractCalls.push(call.callData);
        }
        if (mode === 'aggregate-inner-revert') {
          result = encodeFunctionResult({
            abi: multicall3Abi,
            functionName: 'aggregate3',
            result: batch.args[0].map(() => ({ success: false, returnData: offchain })),
          });
        }
      }
      if (result === undefined) {
        if (contractCalls.some((data) => data.startsWith(callback))) {
          return Response.json({
            jsonrpc: '2.0',
            id: rpc.id,
            error: { code: -32000, message: 'Fixture stopped forbidden callback' },
          });
        }
        return Response.json({
          jsonrpc: '2.0',
          id: rpc.id,
          error: { code: 3, message: 'execution reverted', data: offchain },
        });
      }
    }
    return Response.json({ jsonrpc: '2.0', id: rpc.id, result });
  });
  return { requests, contractCalls };
}

type CcipReadOption = Parameters<typeof createPublicClient>[0]['ccipRead'];

describe('identity inspection never follows CCIP offchain lookups', { concurrency: false }, () => {
  for (const mode of [
    'default-direct',
    'injected-direct',
    'aggregate-rpc-revert',
    'aggregate-inner-revert',
  ]) {
    it(`${mode} is UNAVAILABLE without offchain HTTP or callback RPC`, async (t) => {
      const fixture = interceptEveryFetch(t, mode);
      const options =
        mode === 'injected-direct'
          ? {
              publicClient: createPublicClient({
                chain: base,
                ccipRead: false,
                batch: { multicall: false },
                transport: http(rpcOrigin, { timeout: 8_000, retryCount: 0 }),
              }),
            }
          : undefined;
      await assert.rejects(inspectAgentIdentity({ tokenId: '1' }, options), (error) => {
        assert.ok(error instanceof IdentityInspectionError);
        assert.equal(error.code, 'UNAVAILABLE');
        assert.doesNotMatch(error.message, /127\.0\.0\.1|offchain\.example|OffchainLookup|https?:/);
        assert.equal(error.cause, undefined);
        return true;
      });
      assert.equal(
        fixture.requests.length,
        mode.startsWith('aggregate') ? 4 : 3,
        'no extra offchain HTTP, callback RPC or retry',
      );
      assert.ok(fixture.requests.every((request) => new URL(request.url).origin === rpcOrigin));
      assert.equal(
        fixture.contractCalls.length,
        mode.startsWith('aggregate') ? 5 : 1,
        'no contract callback after a revert',
      );
      assert.ok(fixture.contractCalls.every((data) => !data.startsWith(callback)));
      const [firstCall] = fixture.contractCalls;
      assert.ok(firstCall);
      assert.equal(
        decodeFunctionData({ abi: IDENTITY_INSPECTION_ABI, data: firstCall }).functionName,
        'getIdentity',
      );
    });
  }

  for (const setting of ['unspecified', 'enabled', 'custom-request']) {
    it(`rejects injected ${setting} CCIP configuration before any request`, async (t) => {
      const fixture = interceptEveryFetch(t, 'direct');
      let ccipInvocations = 0;
      // `true` is outside viem's declared option type; the SDK must still reject it at runtime.
      const ccipRead = (
        setting === 'unspecified'
          ? undefined
          : setting === 'enabled'
            ? true
            : {
                request: async () => {
                  ccipInvocations++;
                  await fetch('http://127.0.0.1:12345/caller-selected-gateway');
                  return '0x' as const;
                },
              }
      ) as CcipReadOption;
      const publicClient = createPublicClient({
        chain: base,
        ccipRead,
        transport: http('https://caller-rpc.example.invalid', { timeout: 8_000, retryCount: 0 }),
      });
      await assert.rejects(inspectAgentIdentity({ tokenId: '1' }, { publicClient }), (error) => {
        assert.ok(error instanceof IdentityInspectionError);
        assert.equal(error.code, 'INVALID_INPUT');
        return true;
      });
      assert.deepEqual(fixture.requests, []);
      assert.deepEqual(fixture.contractCalls, []);
      assert.equal(ccipInvocations, 0);
    });
  }
});
