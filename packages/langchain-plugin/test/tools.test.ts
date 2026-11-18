import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { isLangChainTool, ToolInputParsingException } from '@langchain/core/tools';
import { isToolMessage } from '@langchain/core/messages';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import {
  inspectAgentRenewal,
  prepareAutoRenewChange,
  parseBuilderCodeAttribution,
} from '@opensignet/sdk';
import { decodeFunctionData } from 'viem';
import { createOpenSignetTools } from '../dist/index.js';
import {
  abi,
  hash,
  other,
  owner,
  startFixture,
  tokenId,
  vault,
  type Fixture,
} from './fixtures/base-rpc.ts';
import { found, invokeUntyped, objectSchema, toolNamed } from './support.ts';

process.env.LANGSMITH_TRACING = 'false';
process.env.LANGCHAIN_TRACING_V2 = 'false';

let fixture: Fixture;
const nativeFetch = globalThis.fetch;
const unexpected: string[] = [];
before(async () => {
  fixture = await startFixture();
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (request.url !== fixture.url) {
      unexpected.push(request.url);
      throw new Error('External requests are forbidden in this integration test');
    }
    return nativeFetch(input, init);
  };
});
beforeEach(() => {
  fixture.state.scenario = 'found';
  fixture.state.requests.length = 0;
  fixture.state.calls.length = 0;
});
afterEach(() => {
  assert.deepEqual(fixture.state.violations, []);
  assert.deepEqual(unexpected, [], 'No arbitrary URI, CCIP, model, telemetry or API fetch');
});
after(async () => {
  globalThis.fetch = nativeFetch;
  await fixture?.close();
});

describe('renewal observation and unsigned planning through LangChain', () => {
  function tools(includeUnsignedPlans: boolean = false) {
    return createOpenSignetTools({ publicClient: fixture.publicClient, includeUnsignedPlans });
  }
  const intent = { tokenId, expectedOwner: owner, enabled: true, builderCode: 'fixture_app' };

  it('reads the vault and identity at the same hash without treating the minimum as a quote', async () => {
    const input = { tokenId };
    const result = await toolNamed(tools(), 'inspect_agent_renewal').invoke(input);
    assert.equal(result.ok, true);
    assert.equal(result.data.status, 'found');
    assert.equal(result.data.identity.block.hash, hash);
    assert.equal(result.data.vault.availableAtomicUsdc, '5000000');
    assert.equal(result.data.vault.reservedAtomicUsdc, '0');
    assert.equal(result.data.vault.minimumFeeAtomicUsdc, '3900000');
    assert.equal(result.data.renewalExecution, 'keeper_registrar_confirmation_required');
    assert.equal(result.data.consistent, true);
    assert.equal('quote' in result.data, false);
    assert.deepEqual(
      result.data,
      await inspectAgentRenewal(input, { publicClient: fixture.publicClient }),
    );
  });

  it('keeps native isRenewable true separate from underfunding', async () => {
    fixture.state.scenario = 'underfunded';
    const result = await toolNamed(tools(), 'inspect_agent_renewal').invoke({ tokenId });
    assert.equal(result.ok, true);
    const renewal = found(result.data);
    assert.equal(renewal.vault.isRenewable, true);
    assert.equal(renewal.checks.availableCoversMinimum, false);
    assert.equal(renewal.consistent, true);
  });

  it('preserves an unset minimum without inventing a price or affordability verdict', async () => {
    fixture.state.scenario = 'unset-fee';
    const result = await toolNamed(tools(), 'inspect_agent_renewal').invoke({ tokenId });
    assert.equal(result.ok, true);
    const renewal = found(result.data);
    assert.equal(renewal.vault.minimumFeeAtomicUsdc, '0');
    assert.equal(renewal.checks.minimumFeeConfigured, false);
    assert.equal(renewal.checks.availableCoversMinimum, false);
  });

  it('returns missing renewal identity without claiming an empty vault', async () => {
    fixture.state.scenario = 'not-found';
    const result = await toolNamed(tools(), 'inspect_agent_renewal').invoke({
      domain: 'reader.example',
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.status, 'not_found');
    assert.equal('vault' in result.data, false);
    assert.equal(fixture.state.calls.includes('balanceOfToken'), false);
  });

  for (const [scenario, code] of [
    ['vault-failure', 'UNAVAILABLE'],
    ['renewal-changed-block', 'UNSAFE_SNAPSHOT'],
  ] as const) {
    it(`rejects partial renewal observations on ${scenario}`, async () => {
      fixture.state.scenario = scenario;
      const result = await toolNamed(tools(), 'inspect_agent_renewal').invoke({ tokenId });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, code);
      assert.equal('data' in result, false);
    });
  }

  it('has no prepare tool by default and never exposes execution or model approval', () => {
    assert.equal(
      tools().some((candidate) => candidate.name === 'prepare_auto_renew_change'),
      false,
    );
    assert.equal(
      createOpenSignetTools({
        publicClient: fixture.publicClient,
        // @ts-expect-error A truthy string is not the boolean host opt-in and must not enable plans.
        includeUnsignedPlans: 'true',
      }).some((candidate) => candidate.name === 'prepare_auto_renew_change'),
      false,
    );
    const configured = tools(true);
    assert.deepEqual(
      configured.map((candidate) => candidate.name),
      ['inspect_agent_renewal', 'prepare_auto_renew_change'],
    );
    assert.ok(configured.every(isLangChainTool));
    const prepareTool = configured[1];
    assert.ok(prepareTool);
    const plan = objectSchema(convertToOpenAITool(prepareTool).function.parameters);
    assert.deepEqual([...(plan.required ?? [])].sort(), [
      'builderCode',
      'enabled',
      'expectedOwner',
      'tokenId',
    ]);
    assert.deepEqual(Object.keys(plan.properties ?? {}).sort(), [
      'builderCode',
      'enabled',
      'expectedOwner',
      'tokenId',
    ]);
    assert.equal(plan.additionalProperties, false);
  });

  it('prepares exact zero-value attributed calldata without simulating or submitting any write', async () => {
    const planTool = toolNamed(tools(true), 'prepare_auto_renew_change');
    const result = await planTool.invoke(intent);
    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'set_auto_renew');
    assert.equal(result.data.noChange, false);
    assert.equal(result.data.chainId, 8453);
    assert.equal(result.data.transaction.to.toLowerCase(), vault);
    assert.equal(result.data.transaction.value, '0');
    const decoded = decodeFunctionData({ abi, data: result.data.transaction.data });
    assert.equal(decoded.functionName, 'setAutoRenew');
    assert.deepEqual(decoded.args, [BigInt(tokenId), true]);
    assert.equal(parseBuilderCodeAttribution(result.data.transaction.data)?.a, 'fixture_app');
    assert.deepEqual(
      result.data,
      await prepareAutoRenewChange(intent, { publicClient: fixture.publicClient }),
    );
    assert.equal(fixture.state.calls.includes('setAutoRenew'), false);
    assert.doesNotThrow(() => JSON.stringify(result));
  });

  it('returns noChange when the requested flag already matches', async () => {
    fixture.state.scenario = 'enabled';
    const result = await toolNamed(tools(true), 'prepare_auto_renew_change').invoke(intent);
    assert.equal(result.ok, true);
    assert.equal(result.data.noChange, true);
  });

  it('preserves the pending reservation warning when preparing disable', async () => {
    fixture.state.scenario = 'pending';
    const result = await toolNamed(tools(true), 'prepare_auto_renew_change').invoke({
      ...intent,
      enabled: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.observation.vault.reservedAtomicUsdc, '4000000');
    assert.equal(result.data.observation.vault.pendingRenewal?.amountAtomicUsdc, '4000000');
    assert.ok(result.data.warnings.some((warning) => /does not cancel/.test(warning)));
  });

  const rejectedPlans: Array<[string, typeof intent, string]> = [
    ['found', { ...intent, expectedOwner: other }, 'OWNER_MISMATCH'],
    ['missing-token', intent, 'IDENTITY_NOT_FOUND'],
    ['mismatch', intent, 'INCONSISTENT_STATE'],
    ['vault-mismatch', intent, 'INCONSISTENT_STATE'],
    ['revoked', intent, 'REVOKED'],
    ['past-grace', intent, 'EXPIRED_TOO_LONG'],
  ];
  for (const [scenario, input, code] of rejectedPlans) {
    it(`does not prepare a plan for ${scenario}/${code}`, async () => {
      fixture.state.scenario = scenario;
      const result = await toolNamed(tools(true), 'prepare_auto_renew_change').invoke(input);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, code);
      assert.equal('data' in result, false);
    });
  }

  it('allows unsigned disable of a revoked identity without claiming renewal success', async () => {
    fixture.state.scenario = 'revoked';
    const result = await toolNamed(tools(true), 'prepare_auto_renew_change').invoke({
      ...intent,
      enabled: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.observation.identity.lifecycle, 'revoked');
    assert.equal(result.data.enabled, false);
  });

  const invalidPlans: Array<Record<string, unknown>> = [
    { ...intent, approved: true },
    { ...intent, enabled: 'true' },
    { ...intent, builderCode: '' },
    { ...intent, builderCode: 'a'.repeat(33) },
    { ...intent, expectedOwner: undefined },
    { ...intent, rpcUrl: 'https://untrusted.example.invalid' },
  ];
  for (const input of invalidPlans) {
    it(`rejects invalid or approval-bearing plan input (${Object.keys(input).join(',')})`, async () => {
      await assert.rejects(
        invokeUntyped(toolNamed(tools(true), 'prepare_auto_renew_change'), input),
        ToolInputParsingException,
      );
      assert.equal(fixture.state.requests.length, 0);
    });
  }
});
function renewalTool() {
  return toolNamed(
    createOpenSignetTools({ publicClient: fixture.publicClient }),
    'inspect_agent_renewal',
  );
}

describe('real LangChain tools with actual SDK over HTTP', () => {
  it('creates genuine schema-bound tools with no eager network request', () => {
    const tools = createOpenSignetTools({ publicClient: fixture.publicClient });
    assert.deepEqual(
      tools.map((candidate) => candidate.name),
      ['inspect_agent_renewal'],
    );
    assert.ok(tools.every(isLangChainTool));
    assert.equal(fixture.state.requests.length, 0);
    const converted = convertToOpenAITool(renewalTool());
    const parameters = objectSchema(converted.function.parameters);
    assert.equal(converted.type, 'function');
    assert.equal(converted.function.name, 'inspect_agent_renewal');
    assert.equal(parameters.type, 'object');
    assert.equal(parameters.additionalProperties, false);
    assert.deepEqual(Object.keys(parameters.properties ?? {}).sort(), [
      'domain',
      'expectedOwner',
      'tokenId',
    ]);
  });

  it('returns the unchanged JSON-safe SDK observation, including large token IDs and recorded URI', async () => {
    const input = { domain: 'reader.example', expectedOwner: owner };
    const result = await renewalTool().invoke(input);
    assert.equal(result.ok, true);
    const identity = found(result.data).identity;
    assert.equal(identity.tokenId, tokenId);
    assert.equal(identity.block.hash, hash);
    assert.equal(identity.checks.expectedOwnerMatches, true);
    assert.equal(identity.consistent, true);
    assert.match(identity.identity.metadataUri, /^https:\/\/untrusted\.example\.invalid\//);
    assert.deepEqual(
      result.data,
      await inspectAgentRenewal(input, { publicClient: fixture.publicClient }),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(result)).data, result.data);
  });

  it('works through actual LangChain ToolCall/ToolMessage dispatch', async () => {
    const message = await renewalTool().invoke({
      type: 'tool_call',
      id: 'renewal-call-1',
      name: 'inspect_agent_renewal',
      args: { tokenId },
    });
    assert.ok(isToolMessage(message));
    assert.equal(message.tool_call_id, 'renewal-call-1');
    const content = message.content;
    assert.ok(typeof content === 'string');
    const output = JSON.parse(content) as {
      ok: boolean;
      data: { identity: { tokenId: string; checks: { expectedOwnerMatches: boolean | null } } };
    };
    assert.equal(output.ok, true);
    assert.equal(output.data.identity.tokenId, tokenId);
    assert.equal(output.data.identity.checks.expectedOwnerMatches, null);
  });

  it('keeps optional owner mismatch separate from intrinsic inconsistency', async () => {
    const result = await renewalTool().invoke({ tokenId, expectedOwner: other });
    assert.equal(result.ok, true);
    const identity = found(result.data).identity;
    assert.equal(identity.checks.expectedOwnerMatches, false);
    assert.equal(identity.consistent, true);
    fixture.state.scenario = 'mismatch';
    const mismatch = await renewalTool().invoke({ tokenId });
    assert.equal(mismatch.ok, true);
    const inconsistent = found(mismatch.data);
    assert.equal(inconsistent.identity.checks.ownerConsistent, false);
    assert.equal(inconsistent.consistent, false);
  });

  for (const scenario of ['expired', 'revoked']) {
    it(`does not label ${scenario} identities active or verified`, async () => {
      fixture.state.scenario = scenario;
      const result = await renewalTool().invoke({ tokenId });
      assert.equal(result.ok, true);
      assert.equal(found(result.data).identity.lifecycle, scenario);
      assert.equal('verified' in result.data, false);
    });
  }

  const missingIdentities: Array<[string, { domain?: string; tokenId?: string }]> = [
    ['not-found', { domain: 'reader.example' }],
    ['missing-token', { tokenId }],
  ];
  for (const [scenario, input] of missingIdentities) {
    it(`preserves authoritative ${scenario} without turning it into an RPC failure`, async () => {
      fixture.state.scenario = scenario;
      const result = await renewalTool().invoke(input);
      assert.equal(result.ok, true);
      assert.equal(result.data.status, 'not_found');
      assert.equal(result.data.identity.status, 'not_found');
      assert.equal('vault' in result.data, false);
    });
  }

  for (const [scenario, code] of [
    ['unavailable', 'UNAVAILABLE'],
    ['wrong-chain', 'WRONG_CHAIN'],
    ['changed-block', 'UNSAFE_SNAPSHOT'],
    ['unsupported-hash', 'UNAVAILABLE'],
    ['offchain', 'UNAVAILABLE'],
  ] as const) {
    it(`fails closed for ${scenario} without fallback, secret details or retry`, async () => {
      fixture.state.scenario = scenario;
      const result = await renewalTool().invoke({ tokenId });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, code);
      assert.equal('data' in result, false);
      assert.doesNotMatch(
        JSON.stringify(result),
        /synthetic-private-provider-detail|untrusted\.example/,
      );
      if (scenario === 'unsupported-hash') {
        assert.equal(
          fixture.state.requests.filter((request) => request.method === 'eth_call').length,
          1,
        );
      }
      const count = fixture.state.requests.length;
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(fixture.state.requests.length, count);
    });
  }

  const invalidIdentityInputs: Array<Record<string, unknown>> = [
    { tokenId, apiKey: 'fixture-not-a-real-secret' },
    { tokenId, privateKey: 'fixture-not-a-real-secret' },
    { tokenId, rpcUrl: 'https://untrusted.example.invalid' },
    { tokenId, chainId: 1 },
    { tokenId, registryAddress: other },
    { tokenId: 1 },
    { tokenId: '01' },
    { tokenId, expectedOwner: 'invalid' },
  ];
  for (const input of invalidIdentityInputs) {
    it(`validates model input before any RPC: ${Object.keys(input).join(',')}/${typeof input.tokenId}`, async () => {
      await assert.rejects(invokeUntyped(renewalTool(), input), ToolInputParsingException);
      assert.equal(fixture.state.requests.length, 0);
    });
  }

  const invalidRanges: Array<{ domain?: string; tokenId?: string }> = [
    {},
    { domain: 'reader.example', tokenId },
    { domain: 'https://reader.example/path' },
    { domain: `${'a'.repeat(64)}.example` },
    { tokenId: (1n << 256n).toString() },
  ];
  for (const input of invalidRanges) {
    it(`preserves SDK cross-field/range validation for ${JSON.stringify(input)}`, async () => {
      const result = await renewalTool().invoke(input);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'INVALID_INPUT');
      assert.equal(fixture.state.requests.length, 0);
    });
  }
});
