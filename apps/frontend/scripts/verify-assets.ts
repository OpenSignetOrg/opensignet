import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertBrandMirrors,
  brandTargets,
  listBrandFiles,
  repositoryRoot,
} from '../../../scripts/sync-brand.ts';

export { repositoryRoot };
export const frontendRoot = fileURLToPath(new URL('..', import.meta.url));
export const manifestPath = resolve(frontendRoot, 'brand-assets.manifest.json');
/** Manifest keys are repository-relative: the canonical kit in `brand/` plus these app files. */
const supportFiles = [
  'apps/frontend/public/7f7aee972754591b3e4695e2f955439abd945d242fe0acfe5dc705db272a674c.txt',
  'apps/frontend/src/lib/brand-assets.json',
  'apps/frontend/src/lib/brand-assets.ts',
];
const BRAND_IMAGE = /\.(?:png|svg|jpe?g|ico)$/i;

export interface AssetManifest {
  schemaVersion: 1;
  files: Record<string, string>;
}

export interface BrandConfig {
  assets: Record<string, string>;
  socialImage: { width: number; height: number; alt: string; type: string };
  aliases: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readAssetManifest(): AssetManifest {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isRecord(manifest) || manifest.schemaVersion !== 1 || !isRecord(manifest.files)) {
    throw new Error('Invalid brand asset manifest.');
  }
  const files: Record<string, string> = {};
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (typeof hash !== 'string') throw new Error(`Invalid asset hash: ${file}`);
    files[file] = hash;
  }
  return { schemaVersion: 1, files };
}

export function readBrandConfig(): BrandConfig {
  return JSON.parse(
    readFileSync(resolve(frontendRoot, 'src/lib/brand-assets.json'), 'utf8'),
  ) as BrandConfig;
}

/** Canonical source in `brand/` of every file the frontend serves from its generated mirror. */
export function frontendMirrorSources(): Map<string, string> {
  const frontend = brandTargets().find(({ name }) => name === 'frontend');
  if (!frontend) throw new Error('Missing frontend brand mirror target.');
  return new Map(frontend.files.map(({ source, target }) => [target, source]));
}

/** Binary assets hash byte-for-byte; text assets hash with normalized line endings. */
export function hashInput(file: string, content: Buffer): Buffer {
  return /\.(?:png|jpe?g|ico)$/i.test(file)
    ? content
    : Buffer.from(content.toString('utf8').replaceAll('\r\n', '\n'));
}

export function assetHash(file: string, content: Buffer): string {
  return createHash('sha256').update(hashInput(file, content)).digest('hex');
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

/**
 * Verifies the canonical kit in `brand/` against the approved manifest, every URL in
 * `brand-assets.json` against the served mirror, and the mirror against `brand/` byte for byte.
 */
export function verifyAssets(): { files: number; mirrored: number } {
  const manifest = readAssetManifest();
  const brandFiles = listBrandFiles();
  for (const file of brandFiles) {
    if (!BRAND_IMAGE.test(file)) throw new Error(`Unexpected brand kit entry: ${file}`);
  }
  const actual = [...brandFiles, ...supportFiles].sort();
  const expected = Object.keys(manifest.files).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Tracked brand asset set does not match the approved manifest.');
  }

  for (const file of expected) {
    const expectedHash = manifest.files[file];
    if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw new Error(`Invalid asset hash: ${file}`);
    }
    const path = resolve(repositoryRoot, file);
    if (!lstatSync(path).isFile()) throw new Error(`Brand asset is not a regular file: ${file}`);
    if (assetHash(file, readFileSync(path)) !== expectedHash) {
      throw new Error(`Brand asset integrity check failed: ${file}`);
    }
  }

  const mirror = frontendMirrorSources();
  const brand = readBrandConfig();
  for (const [name, path] of Object.entries(brand.assets)) {
    const source = mirror.get(`apps/frontend/public${path}`);
    if (!source || !(source in manifest.files)) throw new Error(`Untracked brand mapping: ${name}`);
  }
  for (const [path, asset] of Object.entries(brand.aliases)) {
    if (!(asset in brand.assets)) throw new Error(`Unknown brand alias target: ${asset}`);
    let exists = true;
    try {
      lstatSync(resolve(frontendRoot, `public${path}`));
    } catch (error) {
      if (!isMissing(error)) throw error;
      exists = false;
    }
    if (exists)
      throw new Error(`Brand alias must remain a redirect, not a duplicate file: ${path}`);
  }

  assertBrandMirrors(['frontend']);
  return { files: expected.length, mirrored: mirror.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Approved frontend assets verified:', verifyAssets());
}
