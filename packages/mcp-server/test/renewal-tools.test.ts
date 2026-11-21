import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { toolContentLength, toolText, type Cleanup, type ToolCallResult } from './mcp-helpers.ts';

const agentId = '11111111-2222-4333-8444-555555555555';
const apiKey = 'osk_renewal_tools_fixture';
const openResources: Cleanup[] = [];

afterEach(async () => {
  while (openResources.length > 0) {
    await openResources.pop()?.();
  }
});

const renewal = {
  agentId,
  domain: 'northwind.ai',
  status: 'active',
  expiresAt: '2027-11-21T00:00:00Z',
  autoRenew: true,
  method: 'wallet',
  price: '79000000',
  chargeWindow: { opensAt: '2027-10-22T00:00:00Z', closesAt: '2027-11-14T00:00:00Z' },
  wallet: { address: '0x1111111111111111111111111111111111111111', balance: '0', approved: true },
  cardSaved: false,
  ready: false,
  issue: {
    code: 'wallet_balance_low',
    message: 'The OpenSignet wallet holds less USDC than the renewal costs.',
  },
};

/** A stand-in API that records each request with the credential it carried. */
async function startApi() {
  const requests: string[] = [];
  let autoRenew = true;
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url} ${request.headers.authorization ?? 'none'}`);
    response.setHeader('Content-Type', 'application/json');
    const base = `/api/v1/agents/${agentId}`;
    if (request.method === 'GET' && request.url === `${base}/renewal`) {
      response.end(JSON.stringify({ ...renewal, autoRenew }));
      return;
    }
    if (request.method === 'POST' && request.url === `${base}/domain/auto-renew/off`) {
      autoRenew = false;
      response.end(JSON.stringify({ domain: renewal.domain, autoRenew }));
      return;
    }
    if (request.method === 'POST' && request.url === `${base}/domain/auto-renew`) {
      response.statusCode = 409;
      response.end(
        JSON.stringify({
          code: 'RENEWAL_APPROVAL_REQUIRED',
          message: "Renewing from the OpenSignet wallet needs the owner's approval once.",
          details: {},
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  openResources.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { apiUrl: `http://127.0.0.1:${address.port}/api/v1`, requests };
}

async function startMcp(apiUrl: string, env: Record<string, string> = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      OPENSIGNET_API_URL: apiUrl,
      OPENSIGNET_API_KEY: apiKey,
      OPENSIGNET_NETWORK: 'base',
      ...env,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'opensignet-mcp-test', version: '1.0.0' });
  await client.connect(transport);
  openResources.push(async () => {
    await client.close();
  });
  return client;
}

/** Parses the single JSON text item; `T` is the tool response shape the test asserts. */
function parseToolJson<T>(result: ToolCallResult): T {
  assert.equal(result.isError, undefined);
  assert.equal(toolContentLength(result), 1);
  return JSON.parse(toolText(result));
}

describe('MCP renewal tools', () => {
  it('reads renewal status with the API key, also in read-only mode', async () => {
    const { apiUrl, requests } = await startApi();
    const client = await startMcp(apiUrl);
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    assert.ok(tools.includes('get_renewal_status'));
    assert.ok(!tools.includes('set_auto_renew'), 'switching renewal is a write tool');

    const status = parseToolJson<typeof renewal>(
      await client.callTool({ name: 'get_renewal_status', arguments: { agentId } }),
    );
    assert.equal(status.ready, false);
    assert.equal(status.issue?.code, 'wallet_balance_low');
    assert.deepEqual(requests, [`GET /api/v1/agents/${agentId}/renewal Bearer ${apiKey}`]);
  });

  it('switches renewal off, and reports the owner approval it needs to turn on', async () => {
    const { apiUrl, requests } = await startApi();
    const client = await startMcp(apiUrl, { OPENSIGNET_ENABLE_WRITE_TOOLS: 'true' });

    const off = parseToolJson<{ autoRenew: boolean }>(
      await client.callTool({ name: 'set_auto_renew', arguments: { agentId, enabled: false } }),
    );
    assert.equal(off.autoRenew, false);

    const on = await client.callTool({
      name: 'set_auto_renew',
      arguments: { agentId, enabled: true },
    });
    assert.equal(on.isError, true);
    assert.match(toolText(on), /RENEWAL_APPROVAL_REQUIRED/);
    assert.match(toolText(on), /owner's approval once/);

    const loose = await client.callTool({
      name: 'set_auto_renew',
      arguments: { agentId, enabled: 'yes' },
    });
    assert.equal(loose.isError, true, 'enabled must be a boolean');

    assert.deepEqual(requests, [
      `POST /api/v1/agents/${agentId}/domain/auto-renew/off Bearer ${apiKey}`,
      `POST /api/v1/agents/${agentId}/domain/auto-renew Bearer ${apiKey}`,
    ]);
  });
});
