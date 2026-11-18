import { createRequire } from 'node:module';

/**
 * The subset of the sharp image API used by the brand asset scripts.
 *
 * sharp is not a direct frontend dependency: it is the exact copy that Next.js already installs
 * for image optimization, resolved through `next/package.json`. Its bundled declarations are not
 * reachable from this package under pnpm's strict layout, so the used surface is declared here.
 */
export interface SharpMetadata {
  width?: number;
  height?: number;
  channels?: number;
  hasAlpha?: boolean;
  format?: string;
}

export interface SharpRawOutput {
  data: Buffer;
  info: { width: number; height: number; channels: number };
}

export interface SharpInstance {
  metadata(): Promise<SharpMetadata>;
  extract(region: { left: number; top: number; width: number; height: number }): SharpInstance;
  flatten(options: { background: string }): SharpInstance;
  removeAlpha(): SharpInstance;
  ensureAlpha(): SharpInstance;
  raw(): SharpInstance;
  png(options?: { compressionLevel?: number; adaptiveFiltering?: boolean }): SharpInstance;
  jpeg(options?: {
    quality?: number;
    chromaSubsampling?: string;
    mozjpeg?: boolean;
  }): SharpInstance;
  toBuffer(): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: true }): Promise<SharpRawOutput>;
  toFile(path: string): Promise<SharpMetadata>;
}

export type SharpFactory = (input: string | Buffer) => SharpInstance;

export function loadSharp(): SharpFactory {
  const require = createRequire(import.meta.url);
  const nextRequire = createRequire(require.resolve('next/package.json'));
  return nextRequire('sharp') as SharpFactory;
}
