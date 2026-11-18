import { createRequire } from 'node:module';

/**
 * Typed facade for the esbuild API used by tests that bundle application components.
 *
 * esbuild is reached through the exact copy that `tsx` (a frontend devDependency) installs; its
 * declarations are not resolvable from this package under pnpm's strict layout.
 */
export type Loader = 'js' | 'jsx' | 'ts' | 'tsx' | 'json' | 'css' | 'text';

export interface OnResolveArgs {
  path: string;
  importer: string;
  namespace: string;
  resolveDir: string;
  kind: string;
}

export interface OnResolveResult {
  path?: string;
  namespace?: string;
  external?: boolean;
}

export interface OnLoadArgs {
  path: string;
  namespace: string;
}

export interface OnLoadResult {
  contents?: string;
  loader?: Loader;
  resolveDir?: string;
}

export interface PluginBuild {
  onResolve(
    options: { filter: RegExp; namespace?: string },
    callback: (
      args: OnResolveArgs,
    ) => OnResolveResult | undefined | Promise<OnResolveResult | undefined>,
  ): void;
  onLoad(
    options: { filter: RegExp; namespace?: string },
    callback: (args: OnLoadArgs) => OnLoadResult | undefined | Promise<OnLoadResult | undefined>,
  ): void;
}

export interface Plugin {
  name: string;
  setup(build: PluginBuild): void;
}

export interface BuildOptions {
  entryPoints?: string[];
  stdin?: { contents: string; loader?: Loader; resolveDir?: string; sourcefile?: string };
  absWorkingDir?: string;
  bundle?: boolean;
  write?: boolean;
  outdir?: string;
  entryNames?: string;
  chunkNames?: string;
  assetNames?: string;
  splitting?: boolean;
  minify?: boolean;
  sourcemap?: boolean | 'inline';
  platform?: 'browser' | 'node' | 'neutral';
  format?: 'iife' | 'cjs' | 'esm';
  target?: string | string[];
  jsx?: 'transform' | 'preserve' | 'automatic';
  define?: Record<string, string>;
  alias?: Record<string, string>;
  external?: string[];
  loader?: Record<string, Loader>;
  plugins?: Plugin[];
  logLevel?: 'silent' | 'error' | 'warning' | 'info';
}

export interface OutputFile {
  path: string;
  text: string;
  contents: Uint8Array;
}

export interface BuildResult {
  outputFiles: OutputFile[];
  errors: unknown[];
  warnings: unknown[];
}

export interface TransformOptions {
  loader?: Loader;
  format?: 'iife' | 'cjs' | 'esm';
  jsx?: 'transform' | 'preserve' | 'automatic';
  sourcefile?: string;
  target?: string | string[];
}

export interface Esbuild {
  build(options: BuildOptions): Promise<BuildResult>;
  transformSync(input: string, options?: TransformOptions): { code: string };
}

export function loadEsbuild(): Esbuild {
  const require = createRequire(import.meta.url);
  return createRequire(require.resolve('tsx'))('esbuild') as Esbuild;
}

/** Returns the single text output of a bundle, failing loudly when esbuild produced none. */
export function bundleText(result: BuildResult, index = 0): string {
  const output = result.outputFiles[index];
  if (!output) throw new Error('esbuild produced no output file');
  return output.text;
}
