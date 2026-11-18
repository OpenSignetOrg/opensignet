/**
 * Copies the canonical brand kit in `brand/` into the generated, git-ignored mirrors the apps
 * serve. `brand/` is the only committed copy of every brand image; never edit a mirror.
 *
 *   node scripts/sync-brand.ts                 sync every app
 *   node scripts/sync-brand.ts frontend docs   sync the named apps only
 *   node scripts/sync-brand.ts --check         report stale mirrors without writing (exit 1)
 *
 * Unchanged files are skipped, so the sync is cheap enough to run before every app script. Each
 * app owns its mirror directories outright: files there that no longer come from `brand/` are
 * removed. Writes go through a temporary file and an atomic rename so that concurrent runs (Turbo
 * starts build, typecheck and lint in parallel) never expose a partly written file.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Brand directory documentation; it is not an asset and is never mirrored. */
const BRAND_README = 'README.md';
const TEMPORARY_FILE = /^\.sync-brand-.+\.tmp$/;
/** Temporary files older than this belong to a crashed run and may be removed. */
const ABANDONED_TEMPORARY_MS = 60_000;

export type BrandTargetName = 'frontend' | 'docs';
export const BRAND_TARGETS: readonly BrandTargetName[] = ['frontend', 'docs'];

export interface BrandMirrorFile {
  /** Repository-relative path inside `brand/`. */
  source: string;
  /** Repository-relative path of the generated copy. */
  target: string;
}

export interface BrandTarget {
  name: BrandTargetName;
  /** Repository-relative directories that contain only generated brand files. */
  ownedDirectories: readonly string[];
  files: readonly BrandMirrorFile[];
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/** Every canonical brand file, repository-relative and sorted. */
export function listBrandFiles(root = repositoryRoot): string[] {
  const brandRoot = resolve(root, 'brand');
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`brand/ may not contain symlinks: ${path}`);
        if (entry.isDirectory()) return walk(path);
        if (!entry.isFile()) throw new Error(`Unexpected brand/ entry: ${path}`);
        return [toPosix(relative(root, path))];
      });
  return walk(brandRoot).filter((file) => file !== `brand/${BRAND_README}`);
}

/** The docs site ships only the files it references, at the same paths under `/brand/`. */
const DOCS_PUBLIC_FILES = [
  'icons/favicon.svg',
  'icons/favicon-96.png',
  'social/opensignet-docs-social-card.png',
] as const;
/** Starlight imports its header logo from source, so these mirror into `src/assets/brand/`. */
const DOCS_SOURCE_FILES = ['logo/opensignet-mark.svg', 'logo/opensignet-mark-on-dark.svg'] as const;

export function brandTargets(root = repositoryRoot): BrandTarget[] {
  const kit = listBrandFiles(root);
  const known = new Set(kit);
  const fromKit = (file: string, target: string): BrandMirrorFile => {
    const source = `brand/${file}`;
    if (!known.has(source)) throw new Error(`Missing canonical brand file: ${source}`);
    return { source, target };
  };
  return [
    {
      name: 'frontend',
      ownedDirectories: ['apps/frontend/public/brand'],
      files: [
        // The whole kit is public at /brand/<group>/<file>, mirroring brand/ exactly.
        ...kit.map((source) => ({
          source,
          target: `apps/frontend/public/${source}`,
        })),
        // Browsers request /favicon.ico at the site root without reading any markup.
        fromKit('icons/favicon.ico', 'apps/frontend/public/favicon.ico'),
      ],
    },
    {
      name: 'docs',
      ownedDirectories: ['apps/docs/public/brand', 'apps/docs/src/assets/brand'],
      files: [
        ...DOCS_PUBLIC_FILES.map((file) => fromKit(file, `apps/docs/public/brand/${file}`)),
        ...DOCS_SOURCE_FILES.map((file) => fromKit(file, `apps/docs/src/assets/brand/${file}`)),
      ],
    },
  ];
}

function sameBytes(path: string, expected: Buffer): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && stat.size === expected.length && readFileSync(path).equals(expected);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOENT']);

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Atomically replaces `path` with `bytes`, retrying while another process holds the file. */
function writeAtomically(path: string, bytes: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    const temporary = join(
      dirname(path),
      `.sync-brand-${process.pid}-${Date.now()}-${attempt}.tmp`,
    );
    try {
      const existing = existsSync(path) ? lstatSync(path) : null;
      if (existing && !existing.isFile()) rmSync(path, { recursive: true, force: true });
      writeFileSync(temporary, bytes);
      renameSync(temporary, path);
      return;
    } catch (error) {
      rmSync(temporary, { force: true });
      // A concurrent run may have just written the same bytes.
      if (sameBytes(path, bytes)) return;
      if (attempt >= 20 || !RETRYABLE.has(errorCode(error) ?? '')) throw error;
      sleep(25 * (attempt + 1));
    }
  }
}

function removeFile(path: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt >= 20 || !RETRYABLE.has(errorCode(error) ?? '')) throw error;
      sleep(25 * (attempt + 1));
    }
  }
}

/** Files (and non-file entries) under an owned directory, repository-relative. */
function ownedEntries(root: string, directory: string): string[] {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];
  if (!lstatSync(absolute).isDirectory()) return [directory];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory() && !entry.isSymbolicLink()) return ownedEntries(root, path);
    return [path];
  });
}

function isActiveTemporary(root: string, path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (!TEMPORARY_FILE.test(name)) return false;
  try {
    return Date.now() - lstatSync(resolve(root, path)).mtimeMs < ABANDONED_TEMPORARY_MS;
  } catch {
    return false;
  }
}

function removeEmptyDirectories(root: string, directory: string): void {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute) || !lstatSync(absolute).isDirectory()) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(root, `${directory}/${entry.name}`);
  }
  if (readdirSync(absolute).length === 0) {
    try {
      rmdirSync(absolute);
    } catch (error) {
      // A concurrent run may be writing into it again.
      if (!['ENOTEMPTY', 'ENOENT', 'EPERM', 'EBUSY'].includes(errorCode(error) ?? '')) throw error;
    }
  }
}

export interface SyncResult {
  target: BrandTargetName;
  written: string[];
  unchanged: number;
  removed: string[];
}

export function syncBrand({
  root = repositoryRoot,
  targets = BRAND_TARGETS,
  check = false,
}: {
  root?: string;
  targets?: readonly BrandTargetName[];
  check?: boolean;
} = {}): SyncResult[] {
  const selected = brandTargets(root).filter((target) => targets.includes(target.name));
  return selected.map((target) => {
    const result: SyncResult = { target: target.name, written: [], unchanged: 0, removed: [] };
    const wanted = new Set(target.files.map(({ target: path }) => path));
    for (const file of target.files) {
      const bytes = readFileSync(resolve(root, file.source));
      const path = resolve(root, file.target);
      if (sameBytes(path, bytes)) {
        result.unchanged++;
        continue;
      }
      result.written.push(file.target);
      if (!check) writeAtomically(path, bytes);
    }
    for (const directory of target.ownedDirectories) {
      for (const path of ownedEntries(root, directory)) {
        if (wanted.has(path) || isActiveTemporary(root, path)) continue;
        result.removed.push(path);
        if (!check) removeFile(resolve(root, path));
      }
      if (!check) removeEmptyDirectories(root, directory);
    }
    return result;
  });
}

/** Throws unless every mirror of the named targets is byte-identical to `brand/` and complete. */
export function assertBrandMirrors(
  targets: readonly BrandTargetName[] = BRAND_TARGETS,
  root = repositoryRoot,
): void {
  const stale = syncBrand({ root, targets, check: true }).flatMap(({ written, removed }) => [
    ...written.map((path) => `${path} differs from brand/ or is missing`),
    ...removed.map((path) => `${path} is not produced from brand/`),
  ]);
  if (stale.length > 0) {
    throw new Error(
      `Generated brand mirrors are stale; run \`pnpm sync:brand\`:\n- ${stale.join('\n- ')}`,
    );
  }
}

function parseTargets(args: readonly string[]): BrandTargetName[] {
  const names = args.filter((arg) => !arg.startsWith('--'));
  for (const name of names) {
    if (!BRAND_TARGETS.includes(name as BrandTargetName)) {
      throw new Error(`Unknown brand target "${name}". Known: ${BRAND_TARGETS.join(', ')}`);
    }
  }
  return names.length > 0 ? (names as BrandTargetName[]) : [...BRAND_TARGETS];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const unknownFlags = args.filter((arg) => arg.startsWith('--') && arg !== '--check');
  if (unknownFlags.length > 0) throw new Error(`Unknown option(s): ${unknownFlags.join(', ')}`);
  const check = args.includes('--check');
  const results = syncBrand({ targets: parseTargets(args), check });
  for (const { target, written, unchanged, removed } of results) {
    const verb = check ? 'stale' : 'written';
    console.log(
      `Brand mirror ${target}: ${written.length} ${verb}, ${unchanged} unchanged, ${removed.length} ${check ? 'extra' : 'removed'}.`,
    );
  }
  if (check && results.some(({ written, removed }) => written.length + removed.length > 0)) {
    for (const { written, removed } of results)
      for (const path of [...written, ...removed]) console.error(`- ${path}`);
    process.exitCode = 1;
  }
}
