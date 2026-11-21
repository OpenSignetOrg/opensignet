import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Explicit native-Python suite. No silent skip or installation during npm tests.
const root = fileURLToPath(new URL('..', import.meta.url));
const localPython = fileURLToPath(
  new URL(
    process.platform === 'win32'
      ? '../examples/crewai/.venv-native/Scripts/python.exe'
      : '../examples/crewai/.venv-native/bin/python',
    import.meta.url,
  ),
);
const python = process.env.OPENSIGNET_CREWAI_PYTHON ?? localPython;
assert.ok(
  existsSync(python),
  'Install examples/crewai/requirements.lock and the built opensignet-crewai wheel in a fresh .venv-native, or set OPENSIGNET_CREWAI_PYTHON to that environment.',
);
const env: Record<string, string | undefined> = {
  CREWAI_TEST_NODE: process.execPath,
  OTEL_SDK_DISABLED: 'true',
  CREWAI_TELEMETRY_DISABLED: 'true',
  CREWAI_TRACING_ENABLED: 'false',
  PYTHONUTF8: '1',
  PYTHONDONTWRITEBYTECODE: '1',
};
for (const [name, value] of Object.entries(process.env)) {
  if (
    /^(PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|COMSPEC|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|USER|USERNAME|LANG)$/i.test(
      name,
    )
  )
    env[name] = value;
}
const child = spawn(python, ['test/crewai-integration.py'], {
  cwd: root,
  env,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '',
  stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});
const code = await new Promise<number | null>((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});
// Trace payloads are JSON lines written by this package's own fixtures and Python harness.
interface ChildTrace {
  pid: number;
}
interface ApiTrace {
  pid: number;
  mode: string;
  method: string;
  path: string;
  authorized: boolean;
}
interface ChromaProof {
  watched: number;
  hits: number;
}
interface RenewalTrace {
  ready: boolean;
  renewal: { domain: string; price: string };
}
const traces = <T>(prefix: string, stream = stderr): T[] =>
  stream
    .split(/\r?\n/)
    .filter((line) => line.includes(prefix))
    .map((line): T => JSON.parse(line.slice(line.indexOf(prefix) + prefix.length)));
const children = traces<ChildTrace>('CREWAI_CHILD ');
process.stdout.write(
  stdout
    .split(/\r?\n/)
    .filter((line) => !/^CREWAI_(RENEWAL|CHROMA) /.test(line))
    .join('\n'),
);
process.stdout.write(
  stderr
    .split(/\r?\n/)
    .map((line) => line.replace(/(?:CREWAI_[A-Z_]+|FIXTURE_API) .*/, ''))
    .filter((line) => line && !/^Processing request of type/.test(line))
    .join('\n'),
);
for (const { pid } of children) {
  assert.throws(
    () => process.kill(pid, 0),
    { code: 'ESRCH' },
    `MCP child ${pid} survived its context manager.`,
  );
}
assert.equal(code, 0, 'Native CrewAI integration failed; diagnostics above.');
assert.ok(children.length >= 7, 'The real Node MCP processes must have run.');
const calls = traces<ApiTrace>('FIXTURE_API ');
assert.ok(calls.length > 0, 'The real SDK must have called the API boundary.');
for (const call of calls) assert.equal(call.method, 'GET', 'Read-only tools never write.');
const failedCallCounts = new Map<number, number>();
for (const call of calls.filter((call) => call.mode === 'api-error')) {
  failedCallCounts.set(call.pid, (failedCallCounts.get(call.pid) ?? 0) + 1);
}
assert.ok(failedCallCounts.size >= 1);
for (const count of failedCallCounts.values())
  assert.equal(count, 1, 'A failed API read must not be retried.');
for (const call of calls.filter((call) => call.path === '/api/v1/domains/availability'))
  assert.equal(call.authorized, false, 'Public reads carry no credential.');
const chromaProofs = traces<ChromaProof>('CREWAI_CHROMA ', stdout);
assert.ok(chromaProofs.length >= 9);
for (const proof of chromaProofs) {
  assert.ok(proof.watched >= 30);
  assert.equal(proof.hits, 0);
}
const renewals = traces<RenewalTrace>('CREWAI_RENEWAL ', stdout);
assert.equal(renewals.length, 1);
assert.equal(renewals[0]!.ready, true);
assert.equal(renewals[0]!.renewal.domain, 'reader.xyz');
console.log(
  `\nOfficial CrewAI connector: ${children.length} real Node processes, ${calls.length} read-only API calls, all children exited; ${chromaProofs.length} Chroma tripwire checks passed.`,
);
