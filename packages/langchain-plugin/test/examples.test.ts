import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { closeServer, serverPort } from './support.ts';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const agentId = '11111111-1111-4111-8111-111111111111';
const fixtureKey = 'local-example-key';
let server: Server;
let apiUrl: string;
const requests: string[] = [];

before(async () => {
  server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url} ${request.headers.authorization ?? 'none'}`);
    response.setHeader('Content-Type', 'application/json');
    if (request.url === `/api/v1/agents/${agentId}/renewal`) {
      response.end(
        JSON.stringify({ agentId, domain: 'reader.example', autoRenew: true, ready: true }),
      );
      return;
    }
    if (request.url === `/api/v1/agents/${agentId}`) {
      response.end(JSON.stringify({ id: agentId, domain: 'reader.example', status: 'active' }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  apiUrl = `http://127.0.0.1:${serverPort(server)}/api/v1`;
});
after(async () => {
  await closeServer(server);
});

/** The JSON fields printed by the examples that these assertions read. */
interface ExampleOutput {
  ok: boolean;
  data?: { domain?: string; autoRenew?: boolean; ready?: boolean };
}

function run(example: string, args: string[]) {
  return execute(process.execPath, [`./examples/${example}.ts`, ...args], {
    cwd: root,
    // Generous bound: the full workspace verification runs these child processes under load.
    timeout: 30_000,
    env: {
      ...process.env,
      LANGSMITH_TRACING: 'false',
      LANGCHAIN_TRACING_V2: 'false',
      OPENSIGNET_API_URL: apiUrl,
      OPENSIGNET_API_KEY: fixtureKey,
    },
  });
}

describe('runnable examples without a paid model or public network', () => {
  for (const example of ['renewal', 'api-lookup']) {
    it(`${example} help runs without HTTP`, async () => {
      const count = requests.length;
      const result = await run(example, ['--help']);
      assert.match(result.stdout, /node examples\//);
      assert.equal(requests.length, count);
      assert.equal(result.stderr, '');
    });
  }

  it('reads a renewal through the actual SDK and tool path', async () => {
    const result = await run('renewal', ['--agent', agentId]);
    const output = JSON.parse(result.stdout) as ExampleOutput;
    assert.equal(output.ok, true);
    assert.equal(output.data?.domain, 'reader.example');
    assert.equal(output.data?.ready, true);
    assert.ok(requests.includes(`GET /api/v1/agents/${agentId}/renewal Bearer ${fixtureKey}`));
  });

  it('looks up an identity through the actual SDK and tool path', async () => {
    const result = await run('api-lookup', ['--agent', agentId]);
    const output = JSON.parse(result.stdout) as ExampleOutput;
    assert.equal(output.ok, true);
    assert.equal(output.data?.domain, 'reader.example');
  });

  it('refuses a missing agent without network access', async () => {
    const count = requests.length;
    await assert.rejects(run('renewal', []), (error: { code?: number; stderr: string }) => {
      assert.match(error.stderr, /valid agent UUID is required/);
      assert.equal(error.code, 1);
      return true;
    });
    assert.equal(requests.length, count);
  });
});
