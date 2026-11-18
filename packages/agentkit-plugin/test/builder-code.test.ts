import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { OpenSignetActionProvider } from '../dist/index.js';
import { actionNamed, submittedTransaction } from './actions.ts';
import { parseBuilderCodeAttribution } from '@opensignet/sdk';
import { registrationResultSchema } from '@opensignet/shared';

const owner = '0x1111111111111111111111111111111111111111';
const vault = '0x2222222222222222222222222222222222222222';
const txHash = `0x${'ab'.repeat(32)}`;
const builderCode = 'agentkit_test';
const originalFetch = globalThis.fetch;

// Every API request (registration POST and status reads) carries a fresh v2 signature.
async function signReadMessage(message: string) {
  assert.match(
    message,
    /^OpenSignet API request\nversion: 2\naudience: [^\n]+\nmethod: (?:GET|POST)\ntarget: \/[^\n]*\nbody-sha256: [0-9a-f]{64}\ntimestamp: \d{13}\nnonce: [0-9a-f]{32}$/,
  );
  return `0x${'11'.repeat(65)}`;
}

type ReceiptStatus = 'success' | 'reverted';

function transactionReceipt(status: ReceiptStatus) {
  return {
    blockHash: `0x${'01'.repeat(32)}`,
    blockNumber: '0x1',
    contractAddress: null,
    cumulativeGasUsed: '0x5208',
    effectiveGasPrice: '0x1',
    from: owner,
    gasUsed: '0x5208',
    logs: [],
    logsBloom: `0x${'00'.repeat(256)}`,
    status: status === 'success' ? '0x1' : '0x0',
    to: vault,
    transactionHash: txHash,
    transactionIndex: '0x0',
    type: '0x2',
  };
}

function pendingTransaction() {
  return {
    blockHash: null,
    blockNumber: null,
    from: owner,
    gas: '0x186a0',
    hash: txHash,
    input: '0x',
    maxFeePerGas: '0x2',
    maxPriorityFeePerGas: '0x1',
    nonce: '0x0',
    r: `0x${'01'.repeat(32)}`,
    s: `0x${'02'.repeat(32)}`,
    to: vault,
    transactionIndex: null,
    type: '0x2',
    v: '0x0',
    value: '0x0',
  };
}

function mockRegistrationWithReceipt(status: ReceiptStatus | 'confirmation-error') {
  let receiptRequests = 0;
  const registration = registrationResultSchema.parse({
    registrationId: '11111111-1111-4111-8111-111111111111',
    agentId: '22222222-2222-4222-8222-222222222222',
    domain: 'receipt-test.xyz',
    nftTokenId: 7,
    basename: null,
    ensName: null,
    txHash,
    estimatedReadyAt: '2026-09-06T00:00:00.000Z',
    metadataUri: 'ipfs://synthetic-registration-fixture',
    provisioningStatus: 'completed',
  });
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/agents/register')) {
      return new Response(JSON.stringify(registration), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const request = JSON.parse(String(init.body));
    if (request.method === 'eth_getTransactionReceipt') {
      receiptRequests += 1;
    }
    if (
      status === 'confirmation-error' &&
      request.method === 'eth_getTransactionReceipt' &&
      receiptRequests > 1
    ) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32000, message: 'confirmation unavailable' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const result = (() => {
      switch (request.method) {
        case 'eth_blockNumber':
          return '0x1';
        case 'eth_getTransactionByHash':
          return pendingTransaction();
        case 'eth_getTransactionReceipt':
          return status === 'confirmation-error' ? null : transactionReceipt(status);
        default:
          throw new Error(`Unexpected RPC method ${request.method}`);
      }
    })();
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('AgentKit direct Base attribution', () => {
  it('reports registration auto-renew enabled only after a successful receipt', async () => {
    let submitted: unknown;
    mockRegistrationWithReceipt('success');
    const provider = new OpenSignetActionProvider({
      apiUrl: 'https://example.test/api/v1',
      baseRpcUrl: 'https://base-rpc.example.test',
      renewalVaultAddress: vault,
      builderCode,
    });
    const walletProvider = {
      getAddress: () => owner,
      signMessage: signReadMessage,
      sendTransaction: async (request: unknown) => {
        submitted = request;
        return txHash;
      },
    };
    const action = actionNamed(provider, 'register_agent_identity');

    const result = await action.invoke(walletProvider, {
      preferredName: 'receipt-test',
      tld: 'xyz',
      autoRenew: true,
    });

    assert.match(result, /Auto-renew enabled via tx/);
    assert.deepEqual(parseBuilderCodeAttribution(submittedTransaction(submitted).data), {
      a: builderCode,
    });
  });

  it('returns a clear registration auto-renew failure when the receipt reverted', async () => {
    mockRegistrationWithReceipt('reverted');
    const provider = new OpenSignetActionProvider({
      apiUrl: 'https://example.test/api/v1',
      baseRpcUrl: 'https://base-rpc.example.test',
      renewalVaultAddress: vault,
      builderCode,
    });
    const walletProvider = {
      getAddress: () => owner,
      signMessage: signReadMessage,
      sendTransaction: async () => txHash,
    };
    const action = actionNamed(provider, 'register_agent_identity');

    const result = await action.invoke(walletProvider, {
      preferredName: 'receipt-test',
      tld: 'xyz',
      autoRenew: true,
    });

    assert.doesNotMatch(result, /Auto-renew enabled/);
    assert.match(result, /confirmed with status reverted; auto-renew was not enabled/);
  });

  it('returns a clear registration auto-renew failure when confirmation fails', async () => {
    mockRegistrationWithReceipt('confirmation-error');
    const provider = new OpenSignetActionProvider({
      apiUrl: 'https://example.test/api/v1',
      baseRpcUrl: 'https://base-rpc.example.test',
      renewalVaultAddress: vault,
      builderCode,
    });
    const walletProvider = {
      getAddress: () => owner,
      signMessage: signReadMessage,
      sendTransaction: async () => txHash,
    };
    const action = actionNamed(provider, 'register_agent_identity');

    const result = await action.invoke(walletProvider, {
      preferredName: 'receipt-test',
      tld: 'xyz',
      autoRenew: true,
    });

    assert.doesNotMatch(result, /Auto-renew enabled/);
    assert.match(result, /submitted but confirmation failed or remained pending/);
  });

  it('passes attributed auto-renew calldata to walletProvider.sendTransaction', async () => {
    let submitted: unknown;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ tokenId: '7', ownerAddress: owner, autoRenewEnabled: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const provider = new OpenSignetActionProvider({
      apiUrl: 'https://example.test/api/v1',
      renewalVaultAddress: vault,
      builderCode,
    });
    const walletProvider = {
      getAddress: () => owner,
      sendTransaction: async (request: unknown) => {
        submitted = request;
        return txHash;
      },
    };
    const action = actionNamed(provider, 'enable_auto_renew');

    await action.invoke(walletProvider, { agentId: 'agent-id' });

    assert.equal(submittedTransaction(submitted).to, vault);
    assert.deepEqual(parseBuilderCodeAttribution(submittedTransaction(submitted).data), {
      a: builderCode,
    });
  });

  it('does not call the wallet provider when attribution is missing', async () => {
    let submitted = false;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ tokenId: '7', ownerAddress: owner, autoRenewEnabled: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const provider = new OpenSignetActionProvider({
      apiUrl: 'https://example.test/api/v1',
      renewalVaultAddress: vault,
    });
    const walletProvider = {
      getAddress: () => owner,
      sendTransaction: async () => {
        submitted = true;
        return txHash;
      },
    };
    const action = actionNamed(provider, 'enable_auto_renew');

    await assert.rejects(
      () => action.invoke(walletProvider, { agentId: 'agent-id' }),
      /requires builderCode/,
    );
    assert.equal(submitted, false);
  });

  it('submits the SDK-attributed withdrawal transaction without adding a second suffix', async () => {
    let submitted: unknown;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          chainId: 8453,
          to: vault,
          data: '0x12345678',
          value: '0',
          functionName: 'withdraw',
          args: { tokenId: '7', amount: '1000000' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const provider = new OpenSignetActionProvider({
      apiUrl: 'https://example.test/api/v1',
      builderCode,
    });
    const walletProvider = {
      getAddress: () => owner,
      sendTransaction: async (request: unknown) => {
        submitted = request;
        return `0x${'cd'.repeat(32)}`;
      },
    };
    const action = actionNamed(provider, 'withdraw_renewal_vault');

    await action.invoke(walletProvider, { agentId: 'agent-id', amountUsdc: '1' });

    assert.deepEqual(parseBuilderCodeAttribution(submittedTransaction(submitted).data), {
      a: builderCode,
    });
  });
});
