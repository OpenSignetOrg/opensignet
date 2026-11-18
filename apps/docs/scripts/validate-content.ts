import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const DOCS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT_ROOT = join(DOCS_ROOT, 'src', 'content', 'docs');

export function parseJsonc(source: string, file: string): unknown {
  const result = ts.parseConfigFileTextToJson(file, source);
  if (result.error) throw new Error(`${file}: invalid JSONC`);
  const config: unknown = result.config;
  return config;
}

interface WranglerRoute {
  pattern?: unknown;
  custom_domain?: unknown;
}

/** The wrangler.jsonc fields this validator reads; every value is still checked below. */
interface WranglerConfig {
  name?: unknown;
  compatibility_date?: unknown;
  workers_dev?: unknown;
  preview_urls?: unknown;
  main?: unknown;
  observability?: { enabled?: unknown };
  assets?: { directory?: unknown; run_worker_first?: unknown };
  routes?: WranglerRoute[];
  env?: {
    preview?: { name?: unknown; workers_dev?: unknown; preview_urls?: unknown; routes?: unknown };
  };
}

interface DocsManifest {
  private?: unknown;
  license?: unknown;
  homepage?: unknown;
  dependencies?: Record<string, string>;
}

export const EXPECTED_DOCS = [
  'api-reference/agents.mdx',
  'api-reference/dns.mdx',
  'api-reference/email.mdx',
  'api-reference/overview.mdx',
  'api-reference/register.mdx',
  'concepts.mdx',
  'frameworks/agentkit.mdx',
  'frameworks/autogen.mdx',
  'frameworks/crewai.mdx',
  'frameworks/elizaos.mdx',
  'frameworks/langchain.mdx',
  'guides/dns.mdx',
  'guides/email.mdx',
  'guides/registration.mdx',
  'guides/renewal.mdx',
  'guides/x402-payments.mdx',
  'index.mdx',
  'quickstart.mdx',
  'sdk/mcp.mdx',
  'sdk/typescript.mdx',
].sort();

export const MACHINE_DOC_ROUTES = [
  '/llms.txt',
  '/llms-full.txt',
  '/openapi.json',
  '/api-index.json',
  '/.well-known/opensignet.json',
];

export const FORBIDDEN_CONTENT = [
  { label: 'private admin route', pattern: /\/api\/v1\/admin(?:\/|\b)/i },
  { label: 'private webhook route', pattern: /\/api\/webhooks(?:\/|\b)/i },
  {
    label: 'secret-like environment variable',
    pattern: /\b[A-Z][A-Z0-9_]*(?:SECRET|PRIVATE_KEY|PASSWORD)[A-Z0-9_]*\b/,
  },
  {
    label: 'backend environment variable',
    pattern: /\b(?:DATABASE_URL|ADMIN_ADDRESSES|AWS_[A-Z0-9_]+)\b/,
  },
  {
    label: 'obsolete or internal provider',
    pattern: /\b(?:AWS|SES|DynamoDB|QStash|Aurora|RDS|Amazon S3|Lambda|Neon|Vercel)\b/i,
  },
  {
    label: 'private persistence detail',
    pattern: /\b(?:transactional_outbox|durable_workflows|migration_checkpoints)\b/i,
  },
  {
    label: 'private origin detail',
    pattern: /\b(?:Cloud Run URL|service account|edge HMAC|origin secret)\b/i,
  },
  {
    label: 'internal planning or topology narrative',
    pattern:
      /\b(?:private planning|private platform implementation|internal topology|internal runbooks?|backend deployment instructions?|private checkout)\b/i,
  },
  { label: 'runtime environment access', pattern: /\bprocess\.env\b/ },
  { label: 'insecure URL', pattern: /http:\/\//i },
  { label: 'obsolete docs URL', pattern: /https:\/\/opensignet\.app\/docs(?:\/|\b)/i },
];

/**
 * Brand files the docs site ships. They are generated from the repository's `brand/` directory by
 * `scripts/sync-brand.ts`; each copy must match its canonical source and the approved hash.
 */
const APPROVED_ASSETS: Readonly<Record<string, { source: string; sha256: string }>> = {
  'src/assets/brand/logo/opensignet-mark.svg': {
    source: 'brand/logo/opensignet-mark.svg',
    sha256: '75fbbdd719afdf6cf3bde180ca88b0fe0d863ac26caa263f5be6fa2410aee31d',
  },
  'src/assets/brand/logo/opensignet-mark-on-dark.svg': {
    source: 'brand/logo/opensignet-mark-on-dark.svg',
    sha256: '83dcf9c129119ed27bbdb63617b4a4a26c783ff06ac4b0059c8a893af19ec9ea',
  },
  'public/brand/icons/favicon.svg': {
    source: 'brand/icons/favicon.svg',
    sha256: '2af637689d9a3da853fb6fb47fa0185299e4695985b5ff4df073fbafe548db65',
  },
  'public/brand/icons/favicon-96.png': {
    source: 'brand/icons/favicon-96.png',
    sha256: '73863b8a7494c7cb314abcc97715454695757a5b1df19f91d544819b81d7448b',
  },
  'public/brand/social/opensignet-docs-social-card.png': {
    source: 'brand/social/opensignet-docs-social-card.png',
    sha256: '94e9a2ba7bca9cfa6fb41595c9cd55a191599763063c7efdb19eee3c88c4c7c6',
  },
};

function toPosix(value: string): string {
  return value.split(sep).join('/');
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolute)));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

export function parseFrontmatter(
  source: string,
  file: string,
): { title: string; description: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  if (!match) throw new Error(`${file}: missing YAML frontmatter`);
  const frontmatter = match[1] ?? '';

  const title = /^title:\s*(.+)$/m
    .exec(frontmatter)?.[1]
    ?.replace(/^['"]|['"]$/g, '')
    .trim();
  const description = /^description:\s*(.+)$/m
    .exec(frontmatter)?.[1]
    ?.replace(/^['"]|['"]$/g, '')
    .trim();
  if (!title) throw new Error(`${file}: frontmatter title is required`);
  if (!description || description.length < 20) {
    throw new Error(`${file}: frontmatter description must be at least 20 characters`);
  }
  if (/^#\s+/m.test(source.slice(match[0].length))) {
    throw new Error(`${file}: Starlight renders the page title; do not add a duplicate H1`);
  }
  return { title, description, body: source.slice(match[0].length) };
}

export function routeForDoc(file: string): string {
  const withoutExtension = file.replace(/\.mdx?$/, '');
  if (withoutExtension === 'index') return '/';
  return `/${withoutExtension}/`;
}

export function findForbiddenMatches(source: string): string[] {
  return FORBIDDEN_CONTENT.filter(({ pattern }) => pattern.test(source)).map(({ label }) => label);
}

function normalizeInternalLink(link: string): string {
  const withoutQuery = link.split(/[?#]/, 1)[0] ?? '';
  if (withoutQuery === '/') return '/';
  return `/${withoutQuery.replace(/^\/+|\/+$/g, '')}/`;
}

export function validateInternalLinks(
  source: string,
  file: string,
  routes: ReadonlySet<string>,
): void {
  const markdownLink = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const [, rawTarget = ''] of source.matchAll(markdownLink)) {
    const target = rawTarget.trim().split(/\s+/, 1)[0] ?? '';
    if (target.startsWith('#') || target.startsWith('mailto:')) continue;
    if (/^https:\/\//.test(target)) continue;
    if (!target.startsWith('/')) {
      throw new Error(`${file}: internal links must be root-relative: ${target}`);
    }
    if (MACHINE_DOC_ROUTES.includes(target.split(/[?#]/, 1)[0] ?? '')) continue;
    const route = normalizeInternalLink(target);
    if (!routes.has(route)) throw new Error(`${file}: internal link has no page: ${target}`);
  }
}

async function assertApprovedAssets(): Promise<void> {
  for (const [file, { source, sha256 }] of Object.entries(APPROVED_ASSETS)) {
    const content = await readFile(join(DOCS_ROOT, file));
    const hashInput = file.endsWith('.svg')
      ? Buffer.from(content.toString('utf8').replaceAll('\r\n', '\n'))
      : content;
    const digest = createHash('sha256').update(hashInput).digest('hex');
    if (digest !== sha256) throw new Error(`${file}: approved asset hash mismatch`);
    if (!content.equals(await readFile(join(DOCS_ROOT, '..', '..', source)))) {
      throw new Error(`${file}: generated copy differs from ${source}; run pnpm sync:brand`);
    }
  }
}

async function assertAppContract(): Promise<void> {
  // Boundary: manifest fields are compared against exact expected values below.
  const pkg = JSON.parse(await readFile(join(DOCS_ROOT, 'package.json'), 'utf8')) as DocsManifest;
  if (pkg.private !== true) throw new Error('package.json: private must remain true');
  if (pkg.license !== 'Apache-2.0') throw new Error('package.json: license must be Apache-2.0');
  if (pkg.homepage !== 'https://docs.opensignet.com') {
    throw new Error('package.json: canonical homepage mismatch');
  }
  if (pkg.dependencies?.astro !== '7.4.7') throw new Error('package.json: Astro must be 7.4.7');
  if (pkg.dependencies?.['@astrojs/starlight'] !== '0.42.9') {
    throw new Error('package.json: Starlight must be 0.42.9');
  }

  const wranglerFile = join(DOCS_ROOT, 'wrangler.jsonc');
  // Boundary: wrangler fields are compared against exact expected values below.
  const wrangler = parseJsonc(await readFile(wranglerFile, 'utf8'), wranglerFile) as WranglerConfig;
  if (wrangler.name !== 'opensignet-docs') throw new Error('wrangler.jsonc: worker name mismatch');
  if (wrangler.compatibility_date !== '2026-09-01') {
    throw new Error('wrangler.jsonc: compatibility date mismatch');
  }
  if (wrangler.workers_dev !== false || wrangler.preview_urls !== false) {
    throw new Error('wrangler.jsonc: production workers.dev exposure must remain disabled');
  }
  if (wrangler.observability?.enabled !== true) {
    throw new Error('wrangler.jsonc: observability must remain enabled');
  }
  if (wrangler.main !== undefined)
    throw new Error('wrangler.jsonc: static docs must not add Worker code');
  if (wrangler.assets?.directory !== './dist' || wrangler.assets?.run_worker_first !== false) {
    throw new Error('wrangler.jsonc: static asset boundary mismatch');
  }
  const domain = wrangler.routes?.find(
    (route) => route.pattern === 'docs.opensignet.com' && route.custom_domain === true,
  );
  if (!domain) throw new Error('wrangler.jsonc: canonical custom domain is missing');
  if (
    wrangler.env?.preview?.name !== 'opensignet-docs-preview' ||
    wrangler.env.preview.workers_dev !== false ||
    wrangler.env.preview.preview_urls !== false ||
    JSON.stringify(wrangler.env.preview.routes) !== '[]'
  ) {
    throw new Error('wrangler.jsonc: disabled deny-by-default preview environment is required');
  }

  const config = await readFile(join(DOCS_ROOT, 'astro.config.ts'), 'utf8');
  if (!config.includes("const canonicalSite = 'https://docs.opensignet.com'")) {
    throw new Error('astro.config.ts: canonical site mismatch');
  }
  // Readers cannot edit the docs, so pages carry no "Edit page" link.
  if (/editLink\s*:/.test(config)) {
    throw new Error('astro.config.ts: the docs must not show an "Edit page" link');
  }
  if (!config.includes('disable404Route: true')) {
    throw new Error('astro.config.ts: explicit 404 route must remain enabled');
  }
  const notFoundPage = await readFile(join(DOCS_ROOT, 'src', 'pages', '404.astro'), 'utf8');
  const forbidden404 = findForbiddenMatches(notFoundPage);
  if (forbidden404.length) {
    throw new Error(`src/pages/404.astro: forbidden public content: ${forbidden404.join(', ')}`);
  }
  const robots = await readFile(join(DOCS_ROOT, 'public', 'robots.txt'), 'utf8');
  if (!robots.includes('Sitemap: https://docs.opensignet.com/sitemap-index.xml')) {
    throw new Error('robots.txt: canonical sitemap is missing');
  }
  const headers = await readFile(join(DOCS_ROOT, 'public', '_headers'), 'utf8');
  for (const required of [
    'Content-Security-Policy:',
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    'Strict-Transport-Security:',
    'X-Content-Type-Options: nosniff',
    'X-Robots-Tag: noindex, nofollow',
  ]) {
    if (!headers.includes(required)) throw new Error(`_headers: missing ${required}`);
  }

  for (const removed of ['mint.json', 'guides/aws-migration.mdx', 'guides/ses-inbound.mdx']) {
    try {
      await stat(join(DOCS_ROOT, removed));
      throw new Error(`${removed}: legacy/private file must not exist`);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
}

export async function validateDocs(): Promise<{
  files: number;
  routes: number;
  approvedAssets: number;
}> {
  await assertAppContract();
  await assertApprovedAssets();

  const files = (await listFiles(CONTENT_ROOT))
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => toPosix(relative(CONTENT_ROOT, file)))
    .sort();
  if (JSON.stringify(files) !== JSON.stringify(EXPECTED_DOCS)) {
    const missing = EXPECTED_DOCS.filter((file) => !files.includes(file));
    const unexpected = files.filter((file) => !EXPECTED_DOCS.includes(file));
    throw new Error(
      `docs allowlist mismatch; missing=[${missing.join(', ')}] unexpected=[${unexpected.join(', ')}]`,
    );
  }

  const routes = new Set(files.map(routeForDoc));
  for (const file of files) {
    const source = await readFile(join(CONTENT_ROOT, file), 'utf8');
    parseFrontmatter(source, file);
    const forbidden = findForbiddenMatches(source);
    if (forbidden.length)
      throw new Error(`${file}: forbidden public content: ${forbidden.join(', ')}`);
    if (/!\[[^\]]*\]\(https:\/\//i.test(source)) {
      throw new Error(`${file}: documentation images must be local assets`);
    }
    validateInternalLinks(source, file, routes);
  }

  return {
    files: files.length,
    routes: routes.size,
    approvedAssets: Object.keys(APPROVED_ASSETS).length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateDocs()
    .then((result) => console.log(`Docs content valid: ${JSON.stringify(result)}`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
