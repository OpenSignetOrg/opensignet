import assert from 'node:assert/strict';
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, parseAbi } from 'viem';
import './fixtures/identity-rpc.ts';
import { callRequest, encodeDynamicResult, rpcBody } from './fixtures/json-rpc.ts';

// The real MCP server and SDK run below. Only their network boundary is replaced.
for (const key of Object.keys(process.env)) {
  assert.doesNotMatch(
    key,
    /^(AGENT_PRIVATE_KEY|OPENSIGNET_API_KEY|ALLOW_WRITES|NODE_OPTIONS|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY)$/i,
  );
}
assert.equal(process.env.OPENSIGNET_ENABLE_WRITE_TOOLS, 'false');
assert.equal(process.env.OPENSIGNET_API_URL, undefined);
console.error(`CREWAI_CHILD ${JSON.stringify({ pid: process.pid, writes: false })}`);

const mode = process.argv[2] ?? 'found';
interface ListedTool {
  name: string;
  inputSchema: Record<string, unknown>;
}
interface ToolListMessage {
  result?: { tools?: ListedTool[] };
}

const writeStdout = process.stdout.write.bind(process.stdout);
// Replaces every stdout.write overload; only the chunk is inspected and the remaining
// encoding/callback arguments are forwarded unchanged.
process.stdout.write = function (chunk: string | Uint8Array, ...args: unknown[]): boolean {
  if (['missing-tool', 'duplicate-tool', 'invalid-schema'].includes(mode)) {
    try {
      // MCP stdio frames are JSON-RPC messages; only tools/list results are rewritten.
      const message = JSON.parse(String(chunk)) as ToolListMessage;
      const tools = message.result?.tools;
      if (Array.isArray(tools)) {
        const target = tools.find((tool) => tool.name === 'inspect_agent_renewal');
        assert.ok(target);
        if (mode === 'missing-tool' && message.result)
          message.result.tools = tools.filter((tool) => tool !== target);
        if (mode === 'duplicate-tool') tools.push(target);
        if (mode === 'invalid-schema') target.inputSchema.additionalProperties = true;
        chunk = `${JSON.stringify(message)}\n`;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  const written: unknown = Reflect.apply(writeStdout, process.stdout, [chunk, ...args]);
  return written === true;
};
const registry = '0x234a2B83B32910436A35CDa797CCC57988B9Bd15';
const vault = '0xb7b19826a566ebd9e8b50bee986a8da04bbb2c0a';
const hash = `0x${'ab'.repeat(32)}`;
const abi = parseAbi([
  'function balanceOfToken(uint256 tokenId) view returns (uint256)',
  'function autoRenewEnabled(uint256 tokenId) view returns (bool)',
  'function pendingRenewals(uint256 tokenId) view returns (uint256 amount,uint64 expiresAt,uint64 reservedAt)',
  'function renewalWindow() view returns (uint64)',
  'function renewalDuration() view returns (uint64)',
  'function renewalFee() view returns (uint256)',
  'function nft() view returns (address)',
  'function registry() view returns (address)',
  'function usdc() view returns (address)',
  'function lastRenewedAt(uint256 tokenId) view returns (uint64)',
  'function isRenewable(uint256 tokenId) view returns (bool)',
  'function renewalVault() view returns (address)',
]);
const values = {
  balanceOfToken: mode === 'underfunded' ? 0n : 50_000_000n,
  autoRenewEnabled: mode === 'no-change' || mode === 'pending',
  pendingRenewals: mode === 'pending' ? [5_000_000n, 2_000_000_000n, 1_780_682_752n] : [0n, 0n, 0n],
  renewalWindow: 2_592_000n,
  renewalDuration: 31_536_000n,
  renewalFee: 5_000_000n,
  nft: registry,
  registry,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  lastRenewedAt: 0n,
  isRenewable: false, // Fixture expiry is outside the renewal window.
  renewalVault: vault,
};

/** Decodes a Multicall3 batch, which must be an `aggregate3` call. */
function aggregate3Calls(data: `0x${string}`) {
  const decoded = decodeFunctionData({ abi: multicall3Abi, data });
  assert.ok(decoded.functionName === 'aggregate3', 'Expected a Multicall3 aggregate3 batch');
  return decoded.args[0];
}

const identityFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const payload = rpcBody(await request.clone().json());
  const calls = Array.isArray(payload) ? payload : [payload];
  const replies: unknown[] = [];
  for (const call of calls) {
    console.error(
      `CREWAI_RPC ${JSON.stringify({ pid: process.pid, mode, method: call.method, params: call.params })}`,
    );
    assert.ok(
      ['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(call.method),
    );
    if (mode === 'rpc-error') {
      replies.push({
        jsonrpc: '2.0',
        id: call.id,
        error: { code: -32000, message: 'Fixture unavailable' },
      });
      continue;
    }
    let batch: ReturnType<typeof aggregate3Calls> | undefined;
    if (
      call.method === 'eth_call' &&
      callRequest(call.params[0]).to.toLowerCase() === '0xca11bde05977b3631167028862be2a173976ca11'
    ) {
      batch = aggregate3Calls(callRequest(call.params[0]).data);
    }
    const renewal = batch?.some((item) => item.target.toLowerCase() === vault);
    if (batch && renewal) {
      assert.equal(new URL(request.url).href, 'https://mainnet.base.org/');
      assert.equal(request.method, 'POST');
      for (const name of request.headers.keys())
        assert.doesNotMatch(name, /authorization|cookie|api.key/i);
      assert.deepEqual(call.params[1], { blockHash: hash, requireCanonical: true });
      assert.equal(callRequest(call.params[0]).from, undefined);
      assert.equal(callRequest(call.params[0]).value, undefined);
      const results = batch.map((item) => {
        const { functionName, args } = decodeFunctionData({ abi, data: item.callData });
        assert.equal(
          item.target.toLowerCase(),
          functionName === 'renewalVault' ? registry.toLowerCase() : vault,
        );
        if (args?.length) assert.equal(args[0], 7n);
        assert.ok(Object.hasOwn(values, functionName));
        console.error(`CREWAI_VAULT ${JSON.stringify({ functionName, at: call.params[1] })}`);
        return {
          success: true,
          returnData: encodeDynamicResult(abi, functionName, values[functionName]),
        };
      });
      replies.push({
        jsonrpc: '2.0',
        id: call.id,
        result: encodeFunctionResult({
          abi: multicall3Abi,
          functionName: 'aggregate3',
          result: results,
        }),
      });
    } else {
      const result = await identityFetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(call),
      });
      replies.push(await result.json());
    }
  }
  return Response.json(Array.isArray(payload) ? replies : replies[0]);
};

await import('../dist/index.js');
