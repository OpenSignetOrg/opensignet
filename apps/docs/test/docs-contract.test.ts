import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import {
  DOCS_ROOT,
  EXPECTED_DOCS,
  findForbiddenMatches,
  parseFrontmatter,
  parseJsonc,
  routeForDoc,
  validateDocs,
  validateInternalLinks,
} from '../scripts/validate-content.ts';
import { validateHtmlUrls } from '../scripts/validate-output.ts';

function markdownLinkTarget(source: string, label: string): string | undefined {
  const links = [...source.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].filter(
    ([, text]) => text === label,
  );
  assert.equal(links.length, 1, `Expected one Markdown link labeled ${label}`);
  return links[0]?.[2];
}

test('the complete public docs contract validates', async () => {
  const result = await validateDocs();
  assert.deepEqual(result, { files: 20, routes: 20, approvedAssets: 5 });
});

test('docs header logo is the transparent mark, sized by height only', async () => {
  const css = await readFile(join(DOCS_ROOT, 'src', 'styles', 'docs.css'), 'utf8');
  const logoRule = /\.site-title img\s*\{([^}]+)\}/.exec(css)?.[1];
  assert.ok(logoRule, 'Expected the existing docs header logo rule');
  // The mark has no canvas, so it takes no display corners or background.
  assert.doesNotMatch(logoRule, /\bborder-radius\s*:/);
  assert.doesNotMatch(logoRule, /\bbackground/);
  assert.match(logoRule, /(?:^|[\s;])height:\s*1\.625rem\s*;/);
  assert.match(logoRule, /\bwidth:\s*auto\s*;/);
});

test('forbidden infrastructure and operator details are detected', () => {
  assert.deepEqual(findForbiddenMatches('DynamoDB and /api/v1/admin/agents'), [
    'private admin route',
    'obsolete or internal provider',
  ]);
  assert.deepEqual(findForbiddenMatches('DATABASE_URL and process.env'), [
    'backend environment variable',
    'runtime environment access',
  ]);
  assert.deepEqual(findForbiddenMatches('Private planning and internal topology'), [
    'internal planning or topology narrative',
  ]);
});

test('frontmatter requires a useful description and no duplicate H1', () => {
  assert.throws(
    () => parseFrontmatter('---\ntitle: Bad\ndescription: short\n---\n', 'bad.mdx'),
    /at least 20 characters/,
  );
  assert.throws(
    () =>
      parseFrontmatter(
        '---\ntitle: Bad\ndescription: This description is long enough.\n---\n# Duplicate\n',
        'bad.mdx',
      ),
    /duplicate H1/,
  );
});

test('internal links resolve only to published routes', () => {
  const routes = new Set(EXPECTED_DOCS.map(routeForDoc));
  assert.doesNotThrow(() => validateInternalLinks('[Start](/quickstart/)', 'ok.mdx', routes));
  assert.throws(
    () => validateInternalLinks('[Private](/operations/)', 'bad.mdx', routes),
    /has no page/,
  );
  assert.throws(
    () => validateInternalLinks('[Relative](..\/private)', 'bad.mdx', routes),
    /root-relative/,
  );
});

test('built HTML requires an exact canonical origin and local brand assets', () => {
  const canonical = (href: string): string => `<link rel="canonical" href="${href}">`;

  assert.doesNotThrow(() =>
    validateHtmlUrls(canonical('https://docs.opensignet.com/quickstart/'), 'quickstart/index.html'),
  );
  assert.throws(
    () =>
      validateHtmlUrls(
        canonical('https://docs.opensignet.com.evil.example/quickstart/'),
        'quickstart/index.html',
      ),
    /canonical docs URL is invalid/,
  );
  assert.throws(
    () =>
      validateHtmlUrls(
        `${canonical('https://docs.opensignet.com/')}<img src="https://opensignet.com/brand/logo/opensignet-logo.png">`,
        'index.html',
      ),
    /remote frontend brand dependency is forbidden/,
  );
  assert.throws(
    () =>
      validateHtmlUrls(
        canonical('https://attacker@docs.opensignet.com/quickstart/'),
        'quickstart/index.html',
      ),
    /credential-free HTTPS URLs/,
  );
});

test('Cloudflare configuration is static-only and pinned', async () => {
  const configFile = join(DOCS_ROOT, 'wrangler.jsonc');
  // Boundary: each wrangler field is compared with its exact expected value below.
  const config = parseJsonc(await readFile(configFile, 'utf8'), configFile) as {
    name?: unknown;
    compatibility_date?: unknown;
    workers_dev?: unknown;
    preview_urls?: unknown;
    main?: unknown;
    routes?: unknown;
    observability: { enabled?: unknown };
    assets: { directory?: unknown; not_found_handling?: unknown };
    env: { preview?: unknown };
  };
  assert.equal(config.name, 'opensignet-docs');
  assert.equal(config.compatibility_date, '2026-09-01');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.observability.enabled, true);
  assert.equal(config.main, undefined);
  assert.deepEqual(config.routes, [{ pattern: 'docs.opensignet.com', custom_domain: true }]);
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.deepEqual(config.env.preview, {
    name: 'opensignet-docs-preview',
    workers_dev: false,
    preview_urls: false,
    routes: [],
  });
});

test('docs CSP enables only the WebAssembly and worker capabilities required by Pagefind', async () => {
  const headers = await readFile(join(DOCS_ROOT, 'public', '_headers'), 'utf8');
  assert.match(headers, /script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'/);
  assert.match(headers, /worker-src 'self' blob:/);
  assert.doesNotMatch(headers, /(?:^|\s)'unsafe-eval'(?:\s|;|$)/m);
});

test('package cannot be published to npm', async () => {
  const pkg = JSON.parse(await readFile(join(DOCS_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.repository.url, 'https://github.com/OpenSignetOrg/opensignet.git');
});

test('framework guides distinguish real language bridges and their publication status', async () => {
  for (const framework of ['langchain', 'crewai', 'autogen']) {
    const source = await readFile(
      join(DOCS_ROOT, 'src', 'content', 'docs', 'frameworks', `${framework}.mdx`),
      'utf8',
    );
    assert.match(source, /```python/);
    assert.match(source, /get_renewal_status/);
    for (const retired of [/inspect_agent_identity/, /inspect_agent_renewal/, /prepare_auto_renew/])
      assert.doesNotMatch(source, retired);
    assert.match(source, /publication|published/);
    assert.doesNotMatch(source, /## Coming soon/);
  }

  const docsConfig = await readFile(join(DOCS_ROOT, 'astro.config.ts'), 'utf8');
  assert.match(docsConfig, /label: 'LangChain'/);
  assert.match(docsConfig, /label: 'CrewAI'/);
  assert.match(docsConfig, /label: 'AutoGen'/);
});

test('framework guides pin 0.1.0, state it is unpublished and retain source development', async () => {
  const framework = (name: string): Promise<string> =>
    readFile(join(DOCS_ROOT, 'src', 'content', 'docs', 'frameworks', `${name}.mdx`), 'utf8');
  const availability =
    /:::note\[Package availability\]\s+Version 0\.1\.0 (?:of `[^`]+` and the MCP server )?is not yet published/;
  for (const name of ['crewai', 'autogen']) {
    const source = await framework(name);
    assert.match(source, availability);
    assert.match(source, /is not yet published to PyPI or npm/);
    assert.equal(
      /```bash\r?\n([\s\S]*?)\r?\n```/.exec(source)?.[1]?.replaceAll('\r\n', '\n'),
      `python -m pip install opensignet-${name}==0.1.0\nnpm install --save-exact @opensignet/mcp-server@0.1.0`,
    );
    assert.ok(source.includes(`python -m pip install ./packages/${name}-plugin`));
    assert.ok(source.includes(`from opensignet_${name} import`));
    assert.match(source, /For source development, install from the public repository root/);
    assert.match(source, /integration tests/);
    assert.match(source, /synthetic API/);
    assert.match(source, /no paid model, live\s+account or wallet/);
    assert.doesNotMatch(source, /is published on|releases\/tag|passed scoped|release evidence/i);
  }
  for (const name of ['agentkit', 'elizaos']) {
    const source = await framework(name);
    assert.match(source, availability);
    assert.match(source, /is not yet published to npm/);
    assert.match(source, /npm install @opensignet\/(?:agentkit|eliza)-plugin@0\.1\.0 /);
    assert.doesNotMatch(source, /is published on|releases\/tag/i);
  }
  const langchain = await framework('langchain');
  assert.match(langchain, availability);
  assert.match(
    langchain,
    /```bash\s+npm install @opensignet\/langchain-plugin@0\.1\.0 @opensignet\/sdk@0\.1\.0 @langchain\/core@\^1\.2\.11\s+```/,
  );
  assert.doesNotMatch(langchain, /catalog records workspace versions|reviewed public repository/);
  assert.match(langchain, /For source development, build from the public repository root/);
  assert.match(langchain, /pnpm --filter @opensignet\/shared build/);
  assert.match(langchain, /pnpm --filter @opensignet\/sdk build/);
  assert.match(langchain, /pnpm --filter @opensignet\/langchain-plugin build/);
  assert.match(langchain, /never sign, pay or send transactions/);
  assert.doesNotMatch(langchain, /is published on|releases\/tag|OIDC|provenance/i);
  const renewal = await readFile(
    join(DOCS_ROOT, 'src', 'content', 'docs', 'guides', 'renewal.mdx'),
    'utf8',
  );
  assert.match(renewal, /openSignet\.getRenewal\(agentId\)/);
  assert.doesNotMatch(renewal, /source-build target|published SDK/);
});

test('CrewAI guide matches the native helper and discloses the pinned Python dependency risk', async () => {
  const source = await readFile(
    join(DOCS_ROOT, 'src', 'content', 'docs', 'frameworks', 'crewai.mdx'),
    'utf8',
  );
  for (const term of [
    'MCPClient',
    'StdioTransport',
    'MCPNativeTool',
    'readonly_flow.py',
    'README.md',
    'requirements.in',
    'requirements.lock',
    'report = renewal_report(tools, agent_id)',
    '.venv-native',
    '--require-hashes',
    'ChromaDB 1.1.1',
    'CVE-2026-45829',
    'CVE-2026-45830',
    'CVE-2026-45831',
    'CVE-2026-45833',
  ]) {
    assert.ok(source.includes(term), `CrewAI: missing ${term}`);
  }
  assert.equal(
    markdownLinkTarget(source, "example's security note"),
    'https://github.com/OpenSignetOrg/opensignet/blob/main/packages/mcp-server/examples/crewai/README.md#security-note',
  );
  assert.equal(
    markdownLinkTarget(source, 'poisoned-collection configuration risk in the Python client'),
    'https://github.com/chroma-core/chroma/issues/6717',
  );
  assert.doesNotMatch(source, /MCPServerAdapter|from crewai_tools/);
  assert.match(source, /reject unexpected arguments/);
  assert.match(source, /opens and closes a local stdio client for each invocation/);
  assert.match(source, /risk is not limited to running an HTTP server/);
  assert.match(source, /not the installed library's safety/);
  assert.match(source, /\*\*not clean\*\*/);
});
