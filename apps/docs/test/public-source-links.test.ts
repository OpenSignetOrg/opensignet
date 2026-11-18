import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { parse as parseToml } from 'smol-toml';
import {
  createMachineDocuments,
  type ApiIndex,
  type DiscoveryDocument,
} from '../scripts/machine-docs.ts';
import type { OpenApiDocument } from '../scripts/public-api-contract.ts';
import { pick } from './json-path.ts';
import { DOCS_ROOT, EXPECTED_DOCS } from '../scripts/validate-content.ts';

const root = join(DOCS_ROOT, '..', '..');
const canonicalRepository = 'https://github.com/OpenSignetOrg/opensignet';
const repository = canonicalRepository;
const read = (path: string): Promise<string> => readFile(join(root, path), 'utf8');
const packageReadmes = [
  'shared',
  'sdk',
  'mcp-server',
  'agentkit-plugin',
  'eliza-plugin',
  'langchain-plugin',
  'crewai-plugin',
  'autogen-plugin',
  'mcp-server/examples/crewai',
  'mcp-server/examples/autogen',
].map((directory) => `packages/${directory}/README.md`);

test('public npm and Python manifests use the canonical source and coordinated workspace version', async () => {
  const { version } = JSON.parse(await read('packages/shared/package.json'));
  for (const directory of [
    'shared',
    'sdk',
    'mcp-server',
    'agentkit-plugin',
    'eliza-plugin',
    'langchain-plugin',
  ]) {
    const manifest = JSON.parse(await read(`packages/${directory}/package.json`));
    assert.equal(manifest.version, version);
    assert.equal(manifest.repository.url, `git+${canonicalRepository}.git`);
    assert.equal(manifest.repository.directory, `packages/${directory}`);
    assert.equal(manifest.bugs.url, `${canonicalRepository}/issues`);
    assert.equal(manifest.license, 'Apache-2.0');
  }
  for (const directory of ['crewai-plugin', 'autogen-plugin']) {
    const project = parseToml(await read(`packages/${directory}/pyproject.toml`))['project'];
    assert.equal(pick(project, 'version'), version);
    assert.equal(
      pick(project, 'urls', 'Repository'),
      directory === 'autogen-plugin'
        ? `${canonicalRepository}/tree/main/packages/${directory}`
        : canonicalRepository,
    );
    assert.equal(pick(project, 'urls', 'Issues'), `${canonicalRepository}/issues`);
    assert.equal(pick(project, 'license'), 'Apache-2.0');
  }
  const contracts = JSON.parse(await read('contracts/package.json'));
  assert.equal(contracts.repository, `${repository}.git`);
  assert.equal(contracts.private, true);
});

test('shared docs navigation and metadata use the public GitHub repository', async () => {
  const config = await read('apps/docs/astro.config.ts');
  // Readers cannot edit the docs, so there is no "Edit page" link.
  assert.doesNotMatch(config, /editLink\s*:/);
  assert.match(
    config,
    /icon: 'github',\s+label: 'OpenSignet on GitHub',\s+href: 'https:\/\/github\.com\/OpenSignetOrg\/opensignet'/,
  );
  assert.doesNotMatch(config, /gitlab\.com/i);
  const manifest = JSON.parse(await read('apps/docs/package.json'));
  assert.equal(manifest.repository.url, `${repository}.git`);
  assert.equal(manifest.private, true);
  assert.equal(manifest.license, 'Apache-2.0');
});

test('generated machine documents share GitHub source and native package/license URLs', async () => {
  const documents = await createMachineDocuments();
  // Boundary: generated documents are typed by their builders; fields are asserted below.
  const index = JSON.parse(documents['api-index.json']) as ApiIndex;
  const openapi = JSON.parse(documents['openapi.json']) as OpenApiDocument;
  const discovery = JSON.parse(documents['.well-known/opensignet.json']) as DiscoveryDocument;
  const source = index.source;
  assert.equal(source.repository, repository);
  assert.deepEqual(openapi['x-source'], source);
  assert.deepEqual(discovery.source, source);
  assert.equal(openapi.info.license.url, `${repository}/blob/main/LICENSE`);
  assert.equal(discovery.links.source, repository);
  for (const pkg of source.packages) {
    const directory = pkg.manifest.slice(0, pkg.manifest.lastIndexOf('/'));
    assert.equal(pkg.source, `${repository}/tree/main/${directory}`);
  }
  for (const pkg of index.python) {
    assert.equal(pkg.source, source.packages.find((entry) => entry.name === pkg.package)?.source);
  }
  for (const document of Object.values(documents)) {
    assert.doesNotMatch(document, /https:\/\/gitlab\.com/i);
  }
});

test('contribution links use GitHub and releases are verified locally without hosted CI', async () => {
  const readme = await read('README.md');
  const contributing = await read('CONTRIBUTING.md');
  const releasing = await read('RELEASING.md');
  assert.ok(readme.includes(`[GitHub](${canonicalRepository})`));
  assert.ok(contributing.includes(`[public GitHub repository](${canonicalRepository}/pulls)`));
  assert.match(contributing, /pnpm verify/);
  assert.match(releasing, /pnpm release:prepare/);
  assert.match(releasing, /npm publish/);
  for (const source of [readme, contributing, releasing]) {
    assert.doesNotMatch(source, /gitlab|GitHub Actions workflow|OIDC|ci:public/i);
  }
});

test('security reporting uses private GitHub vulnerability reporting', async () => {
  const policy = await read('SECURITY.md');
  assert.ok(
    policy.includes(`[private vulnerability reporting](${repository}/security/advisories/new)`),
  );
  assert.match(policy, /do not open a public issue/);
  assert.doesNotMatch(policy, /gitlab\.com/i);
});

test('public guides use GitHub-native source links without old release or commit references', async () => {
  for (const file of [
    'README.md',
    'SECURITY.md',
    'CONTRIBUTING.md',
    'apps/docs/README.md',
    'apps/docs/public/llms.txt',
    'AI_DISCLOSURE.md',
    'CHANGELOG.md',
    'RELEASING.md',
    'contracts/README.md',
    ...packageReadmes,
    ...EXPECTED_DOCS.map((file) => `apps/docs/src/content/docs/${file}`),
  ]) {
    const source = await read(file);
    const links = [
      ...new Set(
        source.match(/https:\/\/github\.com\/[A-Za-z0-9-]+\/opensignet(?![\w-])[^\s)<>"'`]*/gi),
      ),
    ];
    assert.doesNotMatch(source, /https:\/\/gitlab\.com/i, file);
    for (const target of links) {
      assert.ok(
        target === canonicalRepository ||
          target.startsWith(`${canonicalRepository}/`) ||
          target === `${canonicalRepository}.git`,
        `${file}: source link must use the OpenSignetOrg organization: ${target}`,
      );
      const { pathname } = new URL(target);
      const suffix = pathname.replace(/^\/OpenSignetOrg\/opensignet/, '');
      if (
        !suffix ||
        /^(?:\.git|\/issues(?:\/new)?|\/pulls|\/security\/(?:policy|advisories\/new))$/.test(suffix)
      )
        continue;
      const path = /^\/(tree|blob|edit)\/main\/(.+)$/.exec(suffix);
      assert.ok(path, `${file}: invalid GitHub-native link: ${target}`);
      const resolved = await stat(join(root, decodeURIComponent(path[2] ?? '')));
      assert.equal(path[1] === 'tree' ? resolved.isDirectory() : resolved.isFile(), true, target);
    }
  }
});

test('upstream security, implementation and license references are not relabeled as project source', async () => {
  for (const [file, links] of [
    [
      'packages/langchain-plugin/README.md',
      [
        'https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-core/src/tools/index.ts',
        'https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-core/LICENSE',
      ],
    ],
    [
      'packages/crewai-plugin/README.md',
      [
        'https://github.com/chroma-core/chroma/issues/6717',
        'https://github.com/crewAIInc/crewAI/blob/1.15.21/lib/crewai/src/crewai/mcp/client.py',
      ],
    ],
    [
      'packages/mcp-server/examples/crewai/README.md',
      [
        'https://github.com/chroma-core/chroma/issues/6717',
        'https://github.com/crewAIInc/crewAI/blob/1.15.21/lib/crewai/src/crewai/mcp/client.py',
        'https://github.com/modelcontextprotocol/python-sdk/tree/v1.28.1',
      ],
    ],
    [
      'apps/docs/src/content/docs/frameworks/crewai.mdx',
      ['https://github.com/chroma-core/chroma/issues/6717'],
    ],
    [
      'apps/docs/src/content/docs/frameworks/autogen.mdx',
      ['https://microsoft.github.io/autogen/stable/reference/python/autogen_ext.tools.mcp.html'],
    ],
  ] satisfies [string, string[]][]) {
    const source = await read(file);
    for (const link of links) assert.ok(source.includes(link), `${file}: missing ${link}`);
  }
});
