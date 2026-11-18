import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { owner, startFixture, tokenId, type Fixture } from './fixtures/base-rpc.ts';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
let fixture: Fixture;

/** The JSON fields printed by the examples that these assertions read. */
interface ExampleOutput {
  ok: boolean;
  data: {
    status?: string;
    identity?: { tokenId: string };
    noChange?: boolean;
    vault?: { minimumFeeAtomicUsdc: string };
    transaction?: { value: string };
  };
}

function parseOutput(stdout: string): ExampleOutput {
  return JSON.parse(stdout) as ExampleOutput;
}

/** execFile rejects with the child's exit code and captured streams. */
interface ExampleFailure {
  code?: number;
  stderr: string;
}
before(async () => {
  fixture = await startFixture();
});
after(async () => {
  await fixture.close();
  assert.deepEqual(fixture.state.violations, []);
});

function run(example: string, args: string[]) {
  return execute(
    process.execPath,
    ['--import', './test/fixtures/example-fetch.ts', `./examples/${example}.ts`, ...args],
    {
      cwd: root,
      // Generous bound: the full workspace verification runs these child processes under load.
      timeout: 30_000,
      env: {
        ...process.env,
        LANGSMITH_TRACING: 'false',
        LANGCHAIN_TRACING_V2: 'false',
        LANGCHAIN_EXAMPLE_FIXTURE_RPC: fixture.url,
      },
    },
  );
}

describe('runnable examples without a paid model or public network', () => {
  for (const example of ['inspect', 'prepare', 'api-lookup']) {
    it(`${example} help runs without HTTP`, async () => {
      const count = fixture.state.requests.length;
      const result = await run(example, ['--help']);
      assert.match(result.stdout, /node examples\//);
      assert.equal(fixture.state.requests.length, count);
      assert.equal(result.stderr, '');
    });
  }
  it('runs the renewal example through the actual default SDK/tool path', async () => {
    const result = await run('inspect', ['--token', tokenId]);
    const output = parseOutput(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.data.identity?.tokenId, tokenId);
    assert.equal(output.data.status, 'found');
  });
  it('runs the renewal example with domain lookup', async () => {
    const result = await run('inspect', ['--domain', 'reader.example']);
    const output = parseOutput(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.data.vault?.minimumFeeAtomicUsdc, '3900000');
  });
  it('runs unsigned preparation without a signer or execution', async () => {
    const result = await run('prepare', [
      '--token',
      tokenId,
      '--owner',
      owner,
      '--enabled',
      'false',
      '--builder-code',
      'fixture_app',
    ]);
    const output = parseOutput(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.data.noChange, true);
    assert.equal(output.data.transaction?.value, '0');
    assert.equal(fixture.state.calls.includes('setAutoRenew'), false);
  });
  it('rejects an ambiguous enabled value without network access', async () => {
    const count = fixture.state.requests.length;
    await assert.rejects(run('prepare', ['--enabled', 'yes']), (error: ExampleFailure) => {
      assert.match(error.stderr, /explicitly true or false/);
      assert.equal(error.code, 1);
      return true;
    });
    assert.equal(fixture.state.requests.length, count);
  });
});
