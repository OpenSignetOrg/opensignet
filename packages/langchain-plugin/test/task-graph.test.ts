import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

interface TurboGraph {
  tasks: Record<string, { dependsOn?: string[] } | undefined>;
}

interface PackageManifest {
  scripts: Record<string, string | undefined>;
}

test('typed LangChain checks build upstream declarations and its own dist on a clean checkout', async () => {
  const graph = JSON.parse(
    await readFile(new URL('../../../turbo.json', import.meta.url), 'utf8'),
  ) as TurboGraph;
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as PackageManifest;
  // The test typecheck imports ../dist, so it needs this package's build as well as upstream builds.
  assert.equal(manifest.scripts['typecheck'], 'tsc --noEmit && tsc -p tsconfig.test.json');
  assert.deepEqual(graph.tasks['@opensignet/langchain-plugin#typecheck']?.dependsOn, [
    '^build',
    'build',
  ]);
  assert.ok(graph.tasks['build']?.dependsOn?.includes('^build'));
  assert.ok(graph.tasks['test']?.dependsOn?.includes('^build'));
});
