import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import type { Config } from 'tailwindcss';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
// tailwindcss/loadConfig evaluates the TypeScript Tailwind config exactly as the build does.
const loadConfig = require('tailwindcss/loadConfig') as (path: string) => Config;

/** Compiles the application stylesheet for the given Tailwind content globs. */
export async function compileApplicationCss(content: string[]): Promise<string> {
  const config = loadConfig(resolve(root, 'tailwind.config.ts'));
  config.content = content.map((path) => resolve(root, path));
  const from = resolve(root, 'src/app/globals.css');
  const result = await postcss([tailwind(config)]).process(readFileSync(from, 'utf8'), { from });
  return result.css;
}
