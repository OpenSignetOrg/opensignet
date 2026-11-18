import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';
import test from 'node:test';

// Exercise the SDK's transitive dependency without adding a direct Hono dependency.
const sdkRequire = createRequire(import.meta.resolve('@modelcontextprotocol/sdk/server/index.js'));
const adapterRequire = createRequire(sdkRequire.resolve('@hono/node-server'));
/** The transitive Hono surface exercised here; hono is not a direct dependency of this package. */
interface HonoContext {
  req: { query(): Record<string, string>; queries(): Record<string, string[]> };
  json(value: unknown): Response;
}
interface HonoApp {
  get(path: string, handler: (context: HonoContext) => Response): void;
  request(url: string): Promise<Response>;
}
interface HonoModule {
  Hono: new () => HonoApp;
}
const { Hono }: HonoModule = sdkRequire('hono');

test('the root overrides cover the reviewed Hono advisories through 4.13.16', async () => {
  const manifest: { pnpm: { overrides: Record<string, string> } } = JSON.parse(
    await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.pnpm.overrides['hono@<4.13.16'], '4.13.16');
  assert.equal(manifest.pnpm.overrides['@hono/node-server@<2.1.6'], '2.1.6');
  assert.equal(manifest.pnpm.overrides['hono@<4.13.13'], undefined);
  assert.equal(manifest.pnpm.overrides['@hono/node-server@<2.1.3'], undefined);
  assert.equal(manifest.pnpm.overrides['hono@<4.13.7'], undefined);
  assert.equal(manifest.pnpm.overrides['hono@<4.12.34'], undefined);
  assert.equal(adapterRequire.resolve('hono'), sdkRequire.resolve('hono'));
  // Neither package exports ./package.json, so read the manifest beside the resolved entry.
  const version = async (name: string): Promise<string> => {
    const entry = sdkRequire.resolve(name);
    const marker = join('node_modules', name, sep);
    const manifestPath = join(
      entry.slice(0, entry.lastIndexOf(marker) + marker.length),
      'package.json',
    );
    const parsed: { version: string } = JSON.parse(await readFile(manifestPath, 'utf8'));
    return parsed.version;
  };
  assert.equal(await version('hono'), '4.13.16');
  assert.equal(await version('@hono/node-server'), '2.1.6');
});

const queryCases = [
  {
    name: 'ignores a query that appears only after the fragment',
    suffix: '#fragment?hidden=yes',
    query: {},
    queries: {},
  },
  {
    name: 'ends a real query at the fragment',
    suffix: '?visible=yes#fragment?hidden=yes',
    query: { visible: 'yes' },
    queries: { visible: ['yes'] },
  },
  {
    name: 'preserves repeated parameters and percent-encoded delimiters',
    suffix: '?tag=one&tag=two&value=a%23b%3Fc',
    query: { tag: 'one', value: 'a#b?c' },
    queries: { tag: ['one', 'two'], value: ['a#b?c'] },
  },
];

for (const { name, suffix, query, queries } of queryCases) {
  test(`transitive Hono ${name} (GHSA-crvj-82cr-hjcx)`, async () => {
    const app = new Hono();
    app.get('/query', (context) =>
      context.json({ query: context.req.query(), queries: context.req.queries() }),
    );
    const response = await app.request(`http://localhost/query${suffix}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { query, queries });
  });
}
