/**
 * Local release preparation for the coordinated public npm packages.
 *
 * This script never publishes. It checks the coordinated version, builds and packs the six
 * `@opensignet/*` packages into `release/npm/`, inspects every archive, and can confirm that the
 * version is still unclaimed on the npm registry. Publication is a separate, manual step that
 * the maintainer runs with their own npm session (see RELEASING.md).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** Dependency order: each package is published after the packages it depends on. */
export const NPM_PACKAGES = [
  'shared',
  'sdk',
  'mcp-server',
  'agentkit-plugin',
  'eliza-plugin',
  'langchain-plugin',
] as const;
export const PYTHON_PACKAGES = {
  'crewai-plugin': 'opensignet-crewai',
  'autogen-plugin': 'opensignet-autogen',
} as const;
export const REPOSITORY_URL = 'git+https://github.com/OpenSignetOrg/opensignet.git';

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 5_000;
const REGISTRY_TIMEOUT_MS = 10_000;
const FORBIDDEN_ARCHIVE_PATH =
  /(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.env|\.npmrc|\.git|node_modules|\.turbo|\.wrangler|secrets?\.json|[^/]+\.(?:key|pem|p12|pfx|tsbuildinfo))(?:\/|$)/i;

export class ReleaseError extends Error {
  override name = 'ReleaseError';
}

function fail(message: string): never {
  throw new ReleaseError(message);
}

interface Manifest {
  name?: unknown;
  version?: unknown;
  private?: unknown;
  license?: unknown;
  repository?: unknown;
  publishConfig?: unknown;
  files?: unknown;
  dependencies?: unknown;
  peerDependencies?: unknown;
  optionalDependencies?: unknown;
}

function property(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined;
}

function readJson(path: string): Manifest {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path}: not an object`);
  return value;
}

export function stableVersion(value: unknown, label: string): string {
  if (typeof value !== 'string' || !STABLE_VERSION.test(value)) {
    fail(`${label}: version must be a stable MAJOR.MINOR.PATCH release`);
  }
  return value;
}

export function pyprojectVersion(text: string, label: string): { name: string; version: string } {
  const project = /^\[project\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text)?.[1] ?? '';
  const name = /^name\s*=\s*"([^"]+)"\s*$/m.exec(project)?.[1];
  const version = /^version\s*=\s*"([^"]+)"\s*$/m.exec(project)?.[1];
  if (!name) fail(`${label}: [project].name is missing`);
  return { name, version: stableVersion(version, label) };
}

/** Confirms that every publishable npm and Python package carries one coordinated version. */
export function coordinatedVersion(root = ROOT): string {
  const versions = new Set<string>();
  for (const slug of NPM_PACKAGES) {
    const path = join(root, 'packages', slug, 'package.json');
    const manifest = readJson(path);
    if (manifest.name !== `@opensignet/${slug}`) fail(`${path}: name must be @opensignet/${slug}`);
    if (manifest.private !== undefined) fail(`${path}: publishable package must not be private`);
    if (manifest.license !== 'Apache-2.0') fail(`${path}: license must be Apache-2.0`);
    if (property(manifest.publishConfig, 'access') !== 'public') {
      fail(`${path}: publishConfig.access must be public`);
    }
    if (property(manifest.repository, 'url') !== REPOSITORY_URL) {
      fail(`${path}: repository.url must be ${REPOSITORY_URL}`);
    }
    versions.add(stableVersion(manifest.version, path));
  }
  for (const [folder, name] of Object.entries(PYTHON_PACKAGES)) {
    const path = join(root, 'packages', folder, 'pyproject.toml');
    const project = pyprojectVersion(readFileSync(path, 'utf8'), path);
    if (project.name !== name) fail(`${path}: [project].name must be ${name}`);
    versions.add(project.version);
  }
  const [version] = versions;
  if (!version || versions.size !== 1) {
    fail(`publishable packages disagree on the version: ${[...versions].sort().join(', ')}`);
  }
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  if (!new RegExp(`^## ${version.replaceAll('.', '\\.')}(?:\\s|$)`, 'm').test(changelog)) {
    fail(`CHANGELOG.md: add a "## ${version}" section before preparing the release`);
  }
  return version;
}

export interface ArchiveEntry {
  path: string;
  content: Buffer;
}

function headerString(header: Buffer, offset: number, length: number): string {
  const field = header.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

function paxPath(content: Buffer): string | undefined {
  let offset = 0;
  while (offset < content.length) {
    const space = content.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(content.subarray(offset, space).toString('ascii'), 10);
    if (!Number.isSafeInteger(length) || length <= 0) break;
    const record = content.subarray(space + 1, offset + length - 1).toString('utf8');
    if (record.startsWith('path=')) return record.slice(5);
    offset += length;
  }
  return undefined;
}

/** Reads a gzip-compressed tar archive without extracting it, rejecting links and devices. */
export function readTarGz(archive: Buffer): ArchiveEntry[] {
  if (archive.length > MAX_ARCHIVE_BYTES) fail('archive exceeds the size limit');
  const tar = gunzipSync(archive, { maxOutputLength: MAX_EXPANDED_BYTES });
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  let pendingPath: string | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(headerString(header, 124, 12).trim() || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0) fail('archive entry has an invalid size');
    const type = headerString(header, 156, 1) || '0';
    const prefix = headerString(header, 345, 155);
    const name = headerString(header, 0, 100);
    const content = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      pendingPath = paxPath(content);
      continue;
    }
    if (type === 'g') continue;
    if (type === 'L') {
      pendingPath = content.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    const path = pendingPath ?? (prefix ? `${prefix}/${name}` : name);
    pendingPath = undefined;
    if (type === '5') continue;
    if (type !== '0') fail(`${path}: archive entry type ${type} is not a regular file`);
    if (entries.length >= MAX_ENTRIES) fail('archive has too many entries');
    entries.push({ path, content: Buffer.from(content) });
  }
  return entries;
}

function dependencySpecifiers(manifest: Manifest): [string, string][] {
  const pairs: [string, string][] = [];
  for (const field of [
    manifest.dependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ]) {
    if (!field || typeof field !== 'object') continue;
    for (const [name, range] of Object.entries(field)) pairs.push([name, String(range)]);
  }
  return pairs;
}

/** Validates one packed npm archive against the coordinated release policy. */
export function inspectNpmArchive(archive: Buffer, slug: string, version: string): ArchiveEntry[] {
  const entries = readTarGz(archive);
  const paths = new Set<string>();
  for (const { path } of entries) {
    if (!path.startsWith('package/') || path.includes('\\') || path.split('/').includes('..')) {
      fail(`${path}: archive path escapes the package root`);
    }
    if (paths.has(path)) fail(`${path}: duplicate archive entry`);
    paths.add(path);
    if (FORBIDDEN_ARCHIVE_PATH.test(path)) fail(`${path}: forbidden file in the package`);
  }
  const manifestEntry = entries.find((entry) => entry.path === 'package/package.json');
  if (!manifestEntry) fail(`@opensignet/${slug}: package.json is missing`);
  const parsed: unknown = JSON.parse(manifestEntry.content.toString('utf8'));
  if (!parsed || typeof parsed !== 'object') fail(`@opensignet/${slug}: package.json is invalid`);
  const manifest: Manifest = parsed;
  if (manifest.name !== `@opensignet/${slug}` || manifest.version !== version) {
    fail(`@opensignet/${slug}: packed manifest name or version mismatch`);
  }
  if (manifest.license !== 'Apache-2.0') fail(`@opensignet/${slug}: license must be Apache-2.0`);
  for (const [name, range] of dependencySpecifiers(manifest)) {
    if (/^(?:workspace|link|file|portal):/.test(range)) {
      fail(`@opensignet/${slug}: dependency ${name} still uses a local protocol (${range})`);
    }
    if (name.startsWith('@opensignet/') && range !== `^${version}` && range !== version) {
      fail(`@opensignet/${slug}: ${name} must depend on the coordinated version, not ${range}`);
    }
  }
  const license = entries
    .find((entry) => entry.path === 'package/LICENSE')
    ?.content.toString('utf8');
  if (!license?.includes('Apache License') || !license.includes('Version 2.0, January 2004')) {
    fail(`@opensignet/${slug}: Apache-2.0 LICENSE text is missing`);
  }
  const notice = entries.find((entry) => entry.path === 'package/NOTICE');
  if (!notice || notice.content.toString('utf8').trim() === '') {
    fail(`@opensignet/${slug}: NOTICE is missing`);
  }
  for (const required of [
    'package/README.md',
    'package/dist/index.js',
    'package/dist/index.d.ts',
  ]) {
    if (!paths.has(required)) fail(`@opensignet/${slug}: ${required.slice(8)} is missing`);
  }
  return entries;
}

export function archiveName(slug: string, version: string): string {
  return `opensignet-${slug}-${version}.tgz`;
}

function pnpm(args: string[], cwd = ROOT): void {
  const cli = process.env['npm_execpath'];
  if (!cli) fail('Run this command through pnpm, for example `pnpm release:prepare`.');
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`pnpm ${args.join(' ')} failed`);
}

/** Builds and packs every npm package into `outDirectory`, then inspects each archive. */
export function packRelease(
  outDirectory: string,
  { build = true } = {},
): { version: string; files: string[] } {
  const version = coordinatedVersion();
  if (existsSync(outDirectory) && readdirSync(outDirectory).length > 0) {
    fail(`${outDirectory} is not empty; remove it before preparing a new release`);
  }
  mkdirSync(outDirectory, { recursive: true });
  if (build) {
    pnpm([
      'exec',
      'turbo',
      'run',
      'build',
      ...NPM_PACKAGES.map((slug) => `--filter=@opensignet/${slug}`),
    ]);
  }
  const files: string[] = [];
  const checksums: string[] = [];
  for (const slug of NPM_PACKAGES) {
    pnpm(['pack', '--pack-destination', outDirectory], join(ROOT, 'packages', slug));
    const file = archiveName(slug, version);
    const archive = readFileSync(join(outDirectory, file));
    inspectNpmArchive(archive, slug, version);
    files.push(file);
    checksums.push(`${createHash('sha256').update(archive).digest('hex')}  ${file}`);
  }
  const unexpected = readdirSync(outDirectory).filter((name) => !files.includes(name));
  if (unexpected.length > 0) fail(`unexpected files in ${outDirectory}: ${unexpected.join(', ')}`);
  writeFileSync(join(outDirectory, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
  writeFileSync(join(outDirectory, 'publish-order.txt'), `${files.join('\n')}\n`);
  return { version, files };
}

export type RegistryLookup = (name: string, version: string) => Promise<number>;

async function npmRegistryStatus(name: string, version: string): Promise<number> {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    {
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    },
  );
  await response.body?.cancel();
  return response.status;
}

/** Refuses a release whose version already exists for any package; read-only. */
export async function assertUnpublished(
  version: string,
  lookup: RegistryLookup = npmRegistryStatus,
): Promise<void> {
  const taken: string[] = [];
  for (const slug of NPM_PACKAGES) {
    const name = `@opensignet/${slug}`;
    const status = await lookup(name, version);
    if (status === 200) taken.push(`${name}@${version}`);
    else if (status !== 404)
      fail(`npm registry lookup for ${name}@${version} returned HTTP ${status}`);
  }
  if (taken.length > 0) {
    fail(`already published (npm versions are immutable): ${taken.join(', ')}`);
  }
}

function printPublishSteps(outDirectory: string, files: readonly string[]): void {
  const relative = outDirectory.startsWith(ROOT)
    ? outDirectory.slice(ROOT.length + 1).replaceAll('\\', '/')
    : outDirectory;
  console.log('\nNothing was published. To publish, run these in order with your own npm session:');
  for (const file of files) console.log(`  npm publish ${relative}/${file} --access public`);
}

async function main(argv: string[]): Promise<void> {
  const [command, ...flags] = argv;
  const outFlag = flags.find((flag) => flag.startsWith('--out='));
  const outDirectory = resolve(ROOT, outFlag ? outFlag.slice(6) : 'release/npm');
  if (command === 'version') {
    console.log(coordinatedVersion());
  } else if (command === 'check-registry') {
    const version = coordinatedVersion();
    await assertUnpublished(version);
    console.log(`@opensignet/*@${version} is not on the npm registry yet.`);
  } else if (command === 'pack') {
    const { version, files } = packRelease(outDirectory);
    console.log(`Packed and inspected ${files.length} archives for ${version} in ${outDirectory}.`);
    printPublishSteps(outDirectory, files);
  } else if (command === 'verify-pack') {
    // Used by `pnpm verify`: pack into a throwaway directory after the build has run.
    const directory = join(tmpdir(), `opensignet-pack-${process.pid}-${Date.now()}`);
    try {
      const { version, files } = packRelease(directory, { build: false });
      console.log(`Pack check passed: ${files.length} archives at ${version}.`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  } else {
    fail('usage: node scripts/release.ts <version|pack|check-registry|verify-pack> [--out=DIR]');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
