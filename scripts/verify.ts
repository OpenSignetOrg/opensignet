/**
 * `pnpm verify`: the complete local verification for this repository. There is no hosted CI;
 * run this before every pull request and release.
 *
 *   pnpm verify                 boundary, secret-free source, licenses, audit, format, typecheck,
 *                               lint, tests, builds, docs output and package packing
 *   pnpm verify --offline       skip the steps that need the network (dependency audit)
 *   pnpm verify --cloudflare    also build the frontend Worker and dry-run both Wrangler deploys
 *
 * Contracts are verified with Foundry when `forge` is on PATH; otherwise that step is reported
 * as skipped rather than silently passing.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const flags = new Set(process.argv.slice(2));
const known = new Set(['--offline', '--cloudflare']);
const unknown = [...flags].filter((flag) => !known.has(flag));
if (unknown.length > 0) {
  console.error(`Unknown option(s): ${unknown.join(', ')}. Known: ${[...known].join(', ')}`);
  process.exit(2);
}

const pnpmCli = process.env['npm_execpath'];
if (!pnpmCli) {
  console.error('Run verification through pnpm: `pnpm verify`.');
  process.exit(2);
}

interface Step {
  name: string;
  command: string;
  args: string[];
  cwd?: string;
}

const pnpm = (name: string, args: string[], cwd?: string): Step => ({
  name,
  command: process.execPath,
  args: [pnpmCli, ...args],
  ...(cwd ? { cwd } : {}),
});
const node = (name: string, args: string[]): Step => ({ name, command: process.execPath, args });

function available(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { stdio: 'ignore', windowsHide: true });
  return !result.error && result.status === 0;
}

const python = available('python', ['--version']) ? 'python' : null;
const forge = available('forge', ['--version']);
const skipped: string[] = [];

const steps: Step[] = [
  node('Public boundary, secret and file-policy check', ['scripts/check-public-boundary.ts']),
  node('Boundary checker self-test', ['scripts/check-public-boundary.ts', '--self-test']),
  pnpm('Repository script typecheck', ['exec', 'tsc', '-p', 'scripts']),
  pnpm('Contracts test typecheck', ['exec', 'tsc', '-p', 'contracts']),
  node('Repository script and dependency-security tests', [
    '--test',
    'scripts/*.test.ts',
    'scripts/seo/test/*.test.ts',
  ]),
  pnpm('Production dependency licenses', ['run', 'check:production-licenses']),
  pnpm('Formatting', ['run', 'format:check']),
  pnpm('Build, typecheck and lint every workspace package', [
    'exec',
    'turbo',
    'run',
    'build',
    'typecheck',
    'lint',
    '--filter=!@opensignet/contracts',
    '--force',
  ]),
  // Tests run after all builds so child-process and fixture timing is not starved by compilers.
  pnpm('Test every workspace package', [
    'exec',
    'turbo',
    'run',
    'test',
    '--filter=!@opensignet/contracts',
    '--force',
  ]),
  pnpm('Docs generated-output validation', [
    '--filter',
    '@opensignet/docs',
    'run',
    'validate:output',
  ]),
  pnpm('Contracts deployment-record test', ['--filter', '@opensignet/contracts', 'run', 'test']),
  node('Package archives (pack and inspect, nothing published)', [
    'scripts/release.ts',
    'verify-pack',
  ]),
];

if (python) {
  steps.splice(3, 0, {
    name: 'Python release and boundary tooling tests',
    command: python,
    args: ['-B', '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_*.py'],
  });
} else {
  skipped.push('Python tooling tests (python is not on PATH; the boundary check also needs it)');
}

if (flags.has('--offline')) {
  skipped.push('Dependency audit (--offline)');
} else {
  steps.splice(
    steps.length - 1,
    0,
    pnpm('Dependency security audit', ['run', 'audit:production:high']),
  );
}

if (forge) {
  steps.push(
    pnpm('Contracts build (Foundry)', ['--filter', '@opensignet/contracts', 'run', 'build']),
    pnpm('Contracts format check (Foundry)', ['--filter', '@opensignet/contracts', 'run', 'lint']),
  );
} else {
  skipped.push('Contracts build and format check (forge is not on PATH)');
}

if (flags.has('--cloudflare')) {
  steps.push(
    pnpm('Frontend Worker build', ['--filter', '@opensignet/frontend', 'run', 'build:cloudflare']),
  );
  for (const filter of ['@opensignet/frontend', '@opensignet/docs']) {
    for (const environment of [['--env='], ['--env', 'preview']]) {
      steps.push(
        pnpm(`Wrangler dry run ${filter} ${environment.join(' ')}`, [
          '--filter',
          filter,
          'exec',
          'wrangler',
          'deploy',
          '--dry-run',
          ...environment,
        ]),
      );
    }
  }
}

const started = Date.now();
for (const [index, step] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${step.name}`);
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd ?? ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    console.error(`\nVerification failed at: ${step.name}`);
    process.exit(result.status ?? 1);
  }
}

const seconds = Math.round((Date.now() - started) / 1000);
console.log(`\nVerification passed: ${steps.length} steps in ${seconds}s.`);
for (const step of skipped) console.log(`Skipped: ${step}`);
