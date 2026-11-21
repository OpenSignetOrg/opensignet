import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type Rule = readonly [pattern: RegExp, description: string];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const allowedRootFiles = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.prettierignore',
  '.prettierrc',
  '.prettierrc.json',
  'AI_DISCLOSURE.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'frontend.env.example',
  'LICENSE',
  'NOTICE',
  'README.md',
  'RELEASING.md',
  'SECURITY.md',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.node.json',
  'turbo.json',
]);
const allowedApplicationRoots = new Set(['docs', 'frontend']);
const allowedPackageRoots = new Set([
  'agentkit-plugin',
  'autogen-plugin',
  'crewai-plugin',
  'eliza-plugin',
  'langchain-plugin',
  'mcp-server',
  'sdk',
  'shared',
]);
const allowedReviewedPatchFiles = new Set([
  'patches/braces@3.0.3.patch',
  'patches/http-cache-semantics@4.3.0.patch',
]);

const forbiddenPathRules: readonly Rule[] = [
  [
    /^\.github\/(?:workflows|actions)(?:\/|$)/i,
    'GitHub Actions automation (verification runs locally)',
  ],
  [/\.(?:js|mjs|cjs|jsx)$/i, 'JavaScript source file (use TypeScript)'],
  [/^apps\/web(?:\/|$)/i, 'private web application path'],
  [/^services(?:\/|$)/i, 'private services path'],
  [/^infrastructure(?:\/|$)/i, 'private infrastructure path'],
  [/^project-planning(?:\/|$)/i, 'private planning path'],
  [
    /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/i,
    'contributor and coding-agent rules file (kept in the private repository)',
  ],
  [/^apps\/frontend\/src\/app\/admin(?:\/|$)/i, 'private admin application path'],
  [/^apps\/frontend\/src\/components\/admin(?:\/|$)/i, 'private admin component path'],
  [
    /^apps\/docs\/(?:src\/content\/docs\/)?(?:[^/]+\/)*(?:aws-migration|ses-inbound|dynamodb-migration|qstash-operations|private-runbook)\.(?:md|mdx)$/i,
    'private operational documentation',
  ],
  [
    /(?:^|\/)(?:node_modules|dist|build|out|release|\.next|\.open-next|\.astro|\.qa|\.turbo|\.wrangler|coverage)(?:\/|$)/i,
    'generated or local build output',
  ],
  [
    /(?:^|\/)(?:\.venv(?:-[^/]+)?|__pycache__|\.pytest_cache|\.ruff_cache|[^/]+\.egg-info)(?:\/|$)/i,
    'Python environment or generated metadata',
  ],
  [/(?:^|\/)\.codex(?:\/|$)/i, 'local agent state'],
  [/(?:^|\/)[^/]+\.(?:bak|orig|tmp)$/i, 'temporary file'],
  [/(?:^|\/)[^/]+~$/i, 'temporary editor file'],
  [/(?:^|\/)\.vercel(?:\/|$)/i, 'Vercel local state'],
  [/(?:^|\/)(?:vercel\.json|\.vercelignore)$/i, 'Vercel configuration'],
  [/(?:^|\/)\.dev\.vars(?:\..+)?$/i, 'Cloudflare environment file'],
  [/(?:^|\/)(?:[^/]+\.env(?:\..+)?|\.env(?:\..+)?)$/i, 'environment file'],
  [
    /(?:^|\/)(?:id_rsa|id_ed25519|[^/]*(?:credentials?|service-account)[^/]*\.(?:json|ya?ml))$/i,
    'credential file',
  ],
  [/(?:^|\/)secrets?\.json$/i, 'secret file'],
  [/(?:^|\/)[^/]+\.(?:key|p12|pfx|jks)$/i, 'private-key container'],
];

const allowedEnvironmentTemplates = [/(?:^|\/)frontend\.env\.example$/i];

export const forbiddenSecretPatterns: readonly Rule[] = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, 'private key material'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'AWS access key ID'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/\bgithub_pat_[0-9A-Za-z_]{20,}\b/, 'GitHub fine-grained token'],
  [/\bgh[pousr]_[0-9A-Za-z]{20,}\b/, 'GitHub token'],
  [/\bnpm_[0-9A-Za-z]{30,}\b/, 'npm token'],
  [/\bpypi-[0-9A-Za-z_-]{50,}\b/, 'PyPI token'],
  [/\bxox[baprs]-[0-9A-Za-z-]{20,}\b/, 'Slack token'],
  [/\bsk_live_[0-9A-Za-z]{16,}\b/, 'live payment secret'],
  [/\bsk-ant-[0-9A-Za-z_-]{20,}\b/, 'Anthropic API key'],
  [
    /["']type["']\s*:\s*["']service_account["'][\s\S]{0,2000}["']private_key["']\s*:/,
    'Google service-account credential',
  ],
  [
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:/]+:[^\s/@]+@/i,
    'database URL with embedded password',
  ],
];

const forbiddenImportRules: readonly Rule[] = [
  [/^@aws-sdk\//, 'AWS SDK'],
  [/^aws-sdk$/, 'AWS SDK'],
  [/^@google-cloud\//, 'Google Cloud SDK'],
  [/^@upstash\//, 'Upstash provider SDK'],
  [/^@neondatabase\//, 'database provider SDK'],
  [
    /^(?:drizzle-orm|ioredis|pg|postgres|mysql2|firebase-admin|@prisma\/client)(?:\/|$)/,
    'backend database or storage package',
  ],
  [
    /^@opensignet\/(?!(?:sdk|shared|mcp-server|agentkit-plugin|eliza-plugin|langchain-plugin|contracts|docs|frontend)(?:\/|$))/,
    'non-public OpenSignet package',
  ],
  [/(?:^|\/)apps\/web(?:\/|$)/, 'private web source'],
  [/(?:^|\/)(?:db|database|services|storage)(?:\/|$)/, 'private backend source area'],
];

interface PackageManifest {
  private?: boolean;
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function normalizePath(path: string): string {
  return path.split(sep).join('/').replace(/^\.\//, '');
}

export function repositoryScopeViolation(path: string): string | null {
  if (allowedReviewedPatchFiles.has(path)) return null;
  const [topLevel = '', child] = path.split('/');
  if (!child) return allowedRootFiles.has(topLevel) ? null : 'unapproved root file';
  if (topLevel === '.github' || topLevel === 'scripts' || topLevel === 'contracts') return null;
  // The canonical brand kit; the apps serve generated, git-ignored copies of it.
  if (topLevel === 'brand') return null;
  if (topLevel === 'apps') {
    return allowedApplicationRoots.has(child) ? null : 'unapproved public application root';
  }
  if (topLevel === 'packages') {
    return allowedPackageRoots.has(child) ? null : 'unapproved public package root';
  }
  return 'unapproved top-level directory';
}

function listRepositoryFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return output.split('\0').filter(Boolean).map(normalizePath).sort();
}

function isAllowedEnvironmentTemplate(path: string): boolean {
  return allowedEnvironmentTemplates.some((pattern) => pattern.test(path));
}

export function pathViolation(path: string): string | null {
  for (const [pattern, description] of forbiddenPathRules) {
    if (pattern.test(path) && !isAllowedEnvironmentTemplate(path)) return description;
  }
  return null;
}

export function extractImports(text: string): string[] {
  const imports: string[] = [];
  const staticImport =
    /^\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gm;
  for (const match of text.matchAll(staticImport)) {
    if (match[1]) imports.push(match[1]);
  }

  const functionImport = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of text.matchAll(functionImport)) {
    if (match[1] && isCodeOffset(text, match.index)) imports.push(match[1]);
  }
  return imports;
}

function isCodeOffset(text: string, offset: number): boolean {
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < offset; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') quote = character;
  }

  return !quote && !lineComment && !blockComment;
}

export function importViolation(specifier: string): string | null {
  return forbiddenImportRules.find(([pattern]) => pattern.test(specifier))?.[1] ?? null;
}

function isText(buffer: Buffer): boolean {
  return !buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function checkEnvironmentTemplate(path: string, text: string, errors: string[]): void {
  if (!isAllowedEnvironmentTemplate(path)) return;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = (match[1] ?? '').trim();
    if (value !== '' && value !== '""' && value !== "''") {
      errors.push(`${path}:${index + 1}: environment template values must be empty`);
    }
  }
}

export function checkPackageManifest(path: string, text: string, errors: string[]): void {
  if (path !== 'package.json' && !/^(?:apps|packages)\/[^/]+\/package\.json$/.test(path)) return;
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(text) as PackageManifest;
  } catch {
    errors.push(`${path}: package manifest is not valid JSON`);
    return;
  }

  if (manifest.license && manifest.license !== 'Apache-2.0') {
    errors.push(`${path}: explicit license must be Apache-2.0`);
  }
  if (manifest.private !== true && manifest.license !== 'Apache-2.0') {
    errors.push(`${path}: publishable package must declare Apache-2.0`);
  }

  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const) {
    for (const dependency of Object.keys(manifest[field] ?? {})) {
      const forbiddenDependency = importViolation(dependency);
      if (forbiddenDependency) {
        errors.push(`${path}: forbidden ${forbiddenDependency} dependency "${dependency}"`);
      }
    }
  }
}

function checkRepository(): void {
  const errors: string[] = [];
  const files = listRepositoryFiles();
  const privateRepositoryName = ['opensignet', 'platform'].join('-');

  for (const path of files) {
    const absolute = resolve(root, path);
    const insideRoot = relative(root, absolute);
    if (insideRoot.startsWith(`..${sep}`) || insideRoot === '..') {
      errors.push(`${path}: resolves outside repository root`);
      continue;
    }
    if (!existsSync(absolute)) continue;
    if (lstatSync(absolute).isSymbolicLink()) {
      errors.push(`${path}: symbolic links are not allowed in the public repository`);
      continue;
    }
    if (!statSync(absolute).isFile()) continue;

    const repositoryScope = repositoryScopeViolation(path);
    if (repositoryScope) errors.push(`${path}: ${repositoryScope}`);

    const forbiddenPath = pathViolation(path);
    if (forbiddenPath) errors.push(`${path}: forbidden ${forbiddenPath}`);

    const buffer = readFileSync(absolute);
    if (!isText(buffer)) continue;
    const text = buffer.toString('utf8');

    if (text.toLowerCase().includes(privateRepositoryName)) {
      errors.push(`${path}: private repository name is forbidden`);
    }
    for (const [pattern, description] of forbiddenSecretPatterns) {
      if (pattern.test(text)) errors.push(`${path}: detected ${description}`);
    }
    for (const specifier of extractImports(text)) {
      const forbiddenImport = importViolation(specifier);
      if (forbiddenImport) {
        errors.push(`${path}: forbidden ${forbiddenImport} import "${specifier}"`);
      }
    }

    checkEnvironmentTemplate(path, text, errors);
    checkPackageManifest(path, text, errors);
  }

  const licensePath = resolve(root, 'LICENSE');
  const noticePath = resolve(root, 'NOTICE');
  if (
    !existsSync(licensePath) ||
    !/Apache License\s+Version 2\.0/.test(readFileSync(licensePath, 'utf8'))
  ) {
    errors.push('LICENSE: root Apache License 2.0 text is required');
  }
  if (!existsSync(noticePath) || readFileSync(noticePath, 'utf8').trim() === '') {
    errors.push('NOTICE: non-empty root notice is required');
  }

  try {
    execFileSync('python', ['-I', '-B', resolve(root, 'scripts/check-python-boundary.py')], {
      cwd: root,
      input: JSON.stringify(files),
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    errors.push(
      'Python source/package boundary check failed; run scripts/check-python-boundary.py with the Git file inventory for details.',
    );
  }

  if (errors.length > 0) {
    console.error('Public boundary check failed:');
    for (const error of [...new Set(errors)].sort()) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Public boundary check passed (${files.length} files inspected).`);
}

export function runSelfTest(): void {
  assert.equal(repositoryScopeViolation('AGENTS.md'), 'unapproved root file');
  assert.equal(repositoryScopeViolation('AGENTS-private.md'), 'unapproved root file');
  assert.match(pathViolation('AGENTS.md') ?? '', /coding-agent rules file/);
  assert.match(pathViolation('CLAUDE.md') ?? '', /coding-agent rules file/);
  assert.match(pathViolation('apps/frontend/AGENTS.md') ?? '', /coding-agent rules file/);
  assert.equal(pathViolation('apps/frontend/src/lib/agent-onboarding.ts'), null);
  assert.equal(repositoryScopeViolation('AI_DISCLOSURE.md'), null);
  assert.equal(repositoryScopeViolation('CHANGELOG.md'), null);
  assert.equal(repositoryScopeViolation('RELEASING.md'), null);
  assert.equal(repositoryScopeViolation('PREEXISTING.md'), 'unapproved root file');
  assert.equal(repositoryScopeViolation('private-pitch.md'), 'unapproved root file');
  assert.equal(repositoryScopeViolation('README.md'), null);
  assert.equal(repositoryScopeViolation('tsconfig.node.json'), null);
  assert.equal(repositoryScopeViolation('brand/README.md'), null);
  assert.equal(repositoryScopeViolation('brand/logo/opensignet-logo.svg'), null);
  assert.equal(repositoryScopeViolation('brand-kit/logo.svg'), 'unapproved top-level directory');
  assert.equal(repositoryScopeViolation('apps/frontend/src/app/page.tsx'), null);
  assert.equal(repositoryScopeViolation('contracts/src/OpenSignetPass.sol'), null);
  assert.equal(repositoryScopeViolation('packages/mcp-server/src/index.ts'), null);
  assert.equal(repositoryScopeViolation('packages/langchain-plugin/src/index.ts'), null);
  assert.equal(repositoryScopeViolation('packages/crewai-plugin/pyproject.toml'), null);
  assert.equal(repositoryScopeViolation('packages/autogen-plugin/pyproject.toml'), null);
  assert.equal(
    repositoryScopeViolation('packages/private-python-service/pyproject.toml'),
    'unapproved public package root',
  );
  for (const path of [
    'packages/crewai-plugin/.venv-consumer/pyvenv.cfg',
    'packages/autogen-plugin/.venv/pyvenv.cfg',
    'packages/autogen-plugin/src/opensignet_autogen/__pycache__/__init__.pyc',
    'packages/crewai-plugin/src/opensignet_crewai.egg-info/PKG-INFO',
  ]) {
    assert.equal(pathViolation(path), 'Python environment or generated metadata');
  }
  assert.equal(
    repositoryScopeViolation('apps/mcp-server/src/index.ts'),
    'unapproved public application root',
  );
  assert.equal(
    repositoryScopeViolation('packages/contracts/src/OpenSignetPass.sol'),
    'unapproved public package root',
  );
  assert.equal(
    repositoryScopeViolation('apps/backend/src/index.ts'),
    'unapproved public application root',
  );
  assert.equal(repositoryScopeViolation('private-notes.md'), 'unapproved root file');
  assert.equal(pathViolation('apps/web/src/index.ts'), 'private web application path');
  assert.equal(pathViolation('services/worker.ts'), 'private services path');
  assert.equal(pathViolation('apps/frontend/vercel.json'), 'Vercel configuration');
  assert.equal(
    pathViolation('apps/docs/guides/aws-migration.mdx'),
    'private operational documentation',
  );
  assert.equal(pathViolation('frontend.env'), 'environment file');
  assert.equal(pathViolation('frontend.env.example'), null);
  assert.equal(pathViolation('backend.env.example'), 'environment file');
  assert.equal(
    pathViolation('release/npm/opensignet-sdk-0.1.0.tgz'),
    'generated or local build output',
  );
  for (const path of ['.github/workflows/ci.yml', '.github/actions/setup/action.yml']) {
    assert.equal(pathViolation(path), 'GitHub Actions automation (verification runs locally)');
  }
  for (const path of ['scripts/x.mjs', 'apps/docs/astro.config.js', 'a/b.cjs', 'c/d.jsx']) {
    assert.equal(pathViolation(path), 'JavaScript source file (use TypeScript)');
  }
  assert.equal(pathViolation('scripts/check-public-boundary.ts'), null);
  assert.equal(importViolation('@opensignet/sdk'), null);
  assert.equal(importViolation('@opensignet/langchain-plugin'), null);
  assert.equal(importViolation('@opensignet/storage'), 'non-public OpenSignet package');
  assert.equal(importViolation('@aws-sdk/client-s3'), 'AWS SDK');
  assert.equal(importViolation('../storage/private-client'), 'private backend source area');
  const packageErrors: string[] = [];
  checkPackageManifest(
    'package.json',
    JSON.stringify({ private: true, license: 'Apache-2.0', dependencies: { pg: '1.0.0' } }),
    packageErrors,
  );
  assert.deepEqual(packageErrors, [
    'package.json: forbidden backend database or storage package dependency "pg"',
  ]);
  assert.deepEqual(
    extractImports("import { x } from '@opensignet/sdk';\nconst y = import('pg');"),
    ['@opensignet/sdk', 'pg'],
  );
  assert.deepEqual(extractImports('const fixture = "import(\'pg\')";'), []);
  const awsPattern = forbiddenSecretPatterns[1]?.[0];
  assert.ok(awsPattern);
  assert.match(['AKIA', '1234567890ABCDEF'].join(''), awsPattern);
  console.log('Public boundary checker self-test passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--self-test')) runSelfTest();
  else checkRepository();
}
