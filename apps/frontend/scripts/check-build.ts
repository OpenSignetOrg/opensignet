import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = fileURLToPath(new URL('..', import.meta.url));
const APPROVED_HANDLERS = [
  '/sitemap.xml/route',
  '/robots.txt/route',
  '/manifest.webmanifest/route',
  /** Static public site-search index; no backend access. */
  '/search-index.json/route',
];

export function assertBuildBoundary(routes: readonly string[], files: readonly string[]): void {
  for (const route of routes) {
    if (/(^|\/)api(\/|$)/.test(route)) {
      throw new Error(`Business API in frontend artifact: ${route}`);
    }
    if (/(^|\/)(?:admin|docs)(\/|$)/.test(route)) {
      throw new Error(`Retired frontend route in artifact: ${route}`);
    }
    if (route.endsWith('/route') && !APPROVED_HANDLERS.includes(route)) {
      throw new Error(`Unapproved frontend handler: ${route}`);
    }
  }
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    if (
      /\/apps\/web\/|\/packages\/storage\/|\/apps\/frontend\/src\/(db|services|storage)\/|@aws-sdk|@google-cloud|@upstash|(?:\/|\+)(?:drizzle-orm|ioredis|pg|postgres)@|(?:^|\/)\.?[^/]*\.env(?:\.|$)|(?:^|\/)\.env(?:\.|$)/.test(
        normalized,
      )
    ) {
      throw new Error('Private backend dependency or environment file in frontend artifact');
    }
  }
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

export function assertWalletBackdropCss(stylesheets: readonly string[]): void {
  let standardBlur = false;
  for (const css of stylesheets) {
    postcss.parse(css).walkRules('.opensignet-wallet-backdrop', (rule) => {
      rule.walkDecls('backdrop-filter', (declaration) => {
        if (declaration.value === 'blur(12px)') standardBlur = true;
      });
    });
  }
  if (!standardBlur) throw new Error('Compiled wallet backdrop lost standard blur support');
}

interface TraceFile {
  files: string[];
}

export function checkBuild(): { routes: number; traceFiles: number; dependencies: number } {
  const server = resolve(root, '.next/server');
  const paths = JSON.parse(
    readFileSync(resolve(server, 'app-paths-manifest.json'), 'utf8'),
  ) as Record<string, string>;
  const files = filesUnder(server);
  const traces = files.filter((file) => file.endsWith('.nft.json'));
  const dependencies = traces.flatMap((file) =>
    (JSON.parse(readFileSync(file, 'utf8')) as TraceFile).files.map((item) =>
      resolve(dirname(file), item),
    ),
  );
  assertBuildBoundary(Object.keys(paths), [...files, ...dependencies]);
  assertWalletBackdropCss(
    filesUnder(resolve(root, '.next/static'))
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(file, 'utf8')),
  );
  for (const file of files.filter((candidate) => candidate.endsWith('.js'))) {
    if (
      /agentsRepo|registrationsRepo|getServerEnv|verifySiweAndStartSession|processInboundEmail|withX402\(/.test(
        readFileSync(file, 'utf8'),
      )
    ) {
      throw new Error(`Backend implementation marker in ${relative(root, file)}`);
    }
  }
  return {
    routes: Object.keys(paths).length,
    traceFiles: traces.length,
    dependencies: dependencies.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(resolve(root, '.next/BUILD_ID'))) throw new Error('Build the frontend first.');
  console.log('Frontend artifact boundary passed:', checkBuild());
}
