import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  REVIEWED_PACKAGE_LICENSE_EXCEPTIONS,
  REVIEWED_PRODUCTION_LICENSES,
  inspectProductionLicenseReport,
  parseProductionLicenseReport,
} from './check-production-licenses.ts';
import { mappingAt, parseLockfile } from './lockfile.ts';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

interface RootManifest {
  pnpm: { overrides: Record<string, string>; auditConfig: unknown };
}
interface FrontendManifest {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

test('accepts every explicitly reviewed production license expression', () => {
  const report = Object.fromEntries(
    REVIEWED_PRODUCTION_LICENSES.map((license) => [license, [{ name: `package-${license}` }]]),
  );
  assert.deepEqual(inspectProductionLicenseReport(report), []);
});

test('rejects unresolved, non-commercial and strong-copyleft licenses', () => {
  for (const license of [
    'Unknown',
    'SEE LICENSE IN LICENSE.md',
    'LicenseRef-NonCommercial-1.0',
    'GPL-3.0-only',
    'AGPL-3.0-or-later',
    'SSPL-1.0',
  ]) {
    const violations = inspectProductionLicenseReport({ [license]: [{ name: 'blocked-package' }] });
    assert.equal(violations.length, 1, license);
    assert.equal(violations[0]?.reason, 'forbidden or unresolved license');
  }
});

test('rejects a valid but unreviewed SPDX license', () => {
  const violations = inspectProductionLicenseReport({ 'WTFPL-2.0': [{ name: 'surprise' }] });
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.reason, 'license is not in the reviewed allow-list');
});

test('allows LGPL only for the reviewed Linux sharp runtime package', () => {
  const [sharpPackage] = REVIEWED_PACKAGE_LICENSE_EXCEPTIONS['LGPL-3.0-or-later'];
  assert.ok(sharpPackage);
  assert.deepEqual(
    inspectProductionLicenseReport({
      'LGPL-3.0-or-later': [{ name: sharpPackage }],
    }),
    [],
  );

  const violations = inspectProductionLicenseReport({
    'LGPL-3.0-or-later': [{ name: sharpPackage }, { name: 'unreviewed-lgpl-package' }],
  });
  assert.deepEqual(violations, [
    {
      license: 'LGPL-3.0-or-later',
      packages: ['unreviewed-lgpl-package'],
      reason: 'license is not in the reviewed allow-list',
    },
  ]);
});

test('rejects malformed license command output', () => {
  assert.throws(() => parseProductionLicenseReport('not-json'), {
    message: 'PRODUCTION_LICENSE_REPORT_INVALID',
  });
  assert.deepEqual(inspectProductionLicenseReport(null), [
    { license: '<invalid report>', packages: [], reason: 'malformed license report' },
  ]);
});

test('repository pins reviewed production dependencies and excludes unsafe graphs', async () => {
  const [rootPackageText, frontendPackageText, lockfile, wagmiSource, walletButtonSource] =
    await Promise.all([
      readFile(path.join(repoRoot, 'package.json'), 'utf8'),
      readFile(path.join(repoRoot, 'apps/frontend/package.json'), 'utf8'),
      readFile(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8'),
      readFile(path.join(repoRoot, 'apps/frontend/src/lib/wagmi.ts'), 'utf8'),
      readFile(
        path.join(repoRoot, 'apps/frontend/src/components/wallet/connect-wallet-button.tsx'),
        'utf8',
      ),
    ]);
  const rootPackage = JSON.parse(rootPackageText) as RootManifest;
  const frontendPackage = JSON.parse(frontendPackageText) as FrontendManifest;

  assert.equal(rootPackage.pnpm.overrides['qs@<6.16.2'], '6.16.2');
  assert.match(lockfile, /qs@6\.16\.2:/);
  assert.doesNotMatch(lockfile, /qs@6\.16\.0:/);
  assert.equal(rootPackage.pnpm.overrides['fast-uri@>=3.0.0 <3.1.9'], '3.1.9');
  assert.equal(frontendPackage.dependencies.next, '16.4.6');
  assert.equal(frontendPackage.devDependencies['eslint-config-next'], '16.4.6');
  assert.equal(frontendPackage.dependencies.wagmi, '3.7.7');
  assert.equal(frontendPackage.dependencies['@coinbase/wallet-sdk'], '4.3.7');
  assert.equal(frontendPackage.dependencies['@walletconnect/ethereum-provider'], '2.21.8');
  assert.doesNotMatch(lockfile, /@metamask\/sdk/i);
  assert.doesNotMatch(`${wagmiSource}\n${walletButtonSource}`, /from ['"]wagmi\/connectors['"]/);
  assert.match(wagmiSource, /wagmi\/connectors\/coinbaseWallet/);
  assert.match(wagmiSource, /wagmi\/connectors\/walletConnect/);
  assert.match(`${wagmiSource}\n${walletButtonSource}`, /wagmi\/connectors\/injected/);
});

test('the audit exceptions are exactly the two reviewed advisories without a usable fix', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as RootManifest;
  assert.deepEqual(manifest.pnpm.auditConfig, {
    ignoreGhsas: ['GHSA-mrhx-c7xc-m3w5', 'GHSA-fc5q-39xc-vjpf'],
  });
});

test('the zod audit exception is zod 3 inside upstream x402, never a workspace package', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as RootManifest;
  const lockfile = await readFile(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  assert.equal(manifest.pnpm.overrides['@reown/appkit-wallet>zod'], '4.6.7');
  const zod = [...lockfile.matchAll(/^ {2}zod@(\d+)\.(\d+)\.(\d+):/gm)].map(
    ([, major, minor, patch]): [number, number, number] => [
      Number(major),
      Number(minor),
      Number(patch),
    ],
  );
  for (const [major, minor, patch] of zod.filter(([major]) => major >= 4))
    assert.ok(
      minor > 6 || (minor === 6 && patch >= 6),
      `zod ${major}.${minor}.${patch} must be patched`,
    );
  // Every workspace package resolves a patched zod 4.
  const importers = lockfile.slice(
    lockfile.indexOf('\nimporters:\n'),
    lockfile.indexOf('\npackages:\n'),
  );
  const workspaceZod = [...importers.matchAll(/zod:\n\s+specifier: [^\n]+\n\s+version: ([^\n]+)/g)];
  assert.ok(workspaceZod.length >= 7);
  for (const [, version = ''] of workspaceZod)
    assert.match(version, /^4\.(?:6\.(?:[6-9]|\d{2,})|(?:[7-9]|\d{2,})\.\d+)$/);
  // zod 3 may remain only inside Coinbase x402 (latest 2.28.0 still requires zod ^3.24.2)
  // and abitype as its optional peer. Remove the exception once x402 moves to zod 4.
  const snapshots = lockfile.slice(lockfile.indexOf('\nsnapshots:\n'));
  const zod3Consumers = new Set(
    snapshots
      .split(/\n(?=  \S)/)
      .filter((block) => /\n\s+zod: 3\./.test(block))
      // Snapshot keys look like '@x402/core@2.25.0' or abitype@1.2.3(peer@x); keep the name.
      .map((block) => /^'?(@?[^@'\s]+)@/.exec((block.split('\n')[0] ?? '').trim())?.[1]),
  );
  assert.ok(
    zod.some(([major]) => major < 4),
    'No zod 3 remains: remove the GHSA-mrhx-c7xc-m3w5 audit exception and its CONTRIBUTING note.',
  );
  assert.deepEqual(
    [...zod3Consumers].sort(),
    ['@x402/core', '@x402/evm', '@x402/extensions', 'abitype'],
    'Only upstream x402 may still depend on zod 3',
  );
});

test('the picomatch audit exception holds only while no patched release is locked and docs stays static', async () => {
  // GHSA-fc5q-39xc-vjpf: ReDoS from attacker-supplied extglob patterns in every picomatch release
  // through 4.0.7, with no patched version published. The production audit reaches it only through
  // the docs site's Astro and Starlight toolchain, which compiles repository-owned patterns at build
  // time. The docs Worker serves the static build output and runs no code, so no picomatch runs in
  // production. Remove the exception and its CONTRIBUTING note once a patched picomatch is locked.
  const lockfile = await readFile(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  const picomatch = [
    ...new Set(
      [...lockfile.matchAll(/^ {2}picomatch@(\d+\.\d+\.\d+):/gm)].map(([, version]) => version),
    ),
  ].sort();
  assert.deepEqual(
    picomatch,
    ['2.3.2', '4.0.7'],
    'A different picomatch is locked: if it fixes GHSA-fc5q-39xc-vjpf, remove the audit exception and its CONTRIBUTING note.',
  );
  const astroConfig = await readFile(path.join(repoRoot, 'apps/docs/astro.config.ts'), 'utf8');
  assert.match(astroConfig, /output: 'static'/);
  const wrangler = await readFile(path.join(repoRoot, 'apps/docs/wrangler.jsonc'), 'utf8');
  assert.doesNotMatch(wrangler, /"main"\s*:/, 'the docs Worker must not run a script');
  assert.match(wrangler, /"directory": "\.\/dist"/);
  assert.match(wrangler, /"run_worker_first": false/);
});

test('security overrides cover every locked resolution at the reviewed official versions', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as RootManifest;
  const lockfile = await readFile(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  const expectedOverrides = {
    'body-parser@>=2.0.0 <2.4.0': '2.4.0',
    'brace-expansion@>=1.0.0 <1.1.21': '1.1.21',
    'brace-expansion@>=2.0.0 <2.1.7': '2.1.7',
    'brace-expansion@>=4.0.0 <5.0.12': '5.0.12',
    'devalue@>=5.0.0 <5.9.3': '5.9.3',
    'fast-uri@>=3.0.0 <3.1.9': '3.1.9',
    'glob@>=10.2.0 <10.5.0': '10.5.0',
    'hono@<4.13.16': '4.13.16',
    'ip-address@<=10.7.3': '10.7.4',
    'postcss-selector-parser@<7.1.6': '7.1.6',
    'proxy-addr@>=2.0.0 <2.0.8': '2.0.8',
    'sharp@<0.35.5': '0.35.5',
    'smol-toml@<1.9.0': '1.9.0',
    'source-map-js@>=1.0.0 <1.2.2': '1.2.2',
    'undici@>=6.0.0 <6.29.1': '6.29.1',
    'undici@>=7.0.0 <7.30.1': '7.30.1',
    'undici@>=8.0.0 <8.12.2': '8.12.2',
    'vite@>=8.2.0 <=8.3.5': '8.3.5',
  };
  const lock = parseLockfile(lockfile);
  const lockedOverrides = Object.fromEntries(mappingAt(lock, 'overrides'));
  for (const [selector, version] of Object.entries(expectedOverrides)) {
    assert.equal(manifest.pnpm.overrides[selector], version);
    assert.equal(lockedOverrides[selector], version);
  }
  for (const sectionName of ['packages', 'snapshots']) {
    const keys = [...mappingAt(lock, sectionName).keys()];
    for (const [name, versions] of Object.entries({
      'brace-expansion': ['1.1.21', '2.1.7', '5.0.12'],
      devalue: ['6.0.3'],
      'fast-uri': ['3.1.9'],
      glob: ['10.5.0', '13.0.6'],
      hono: ['4.13.16'],
      'ip-address': ['10.7.4'],
      '@modelcontextprotocol/sdk': ['1.32.1'],
      next: ['16.4.6'],
      'eslint-config-next': ['16.4.6'],
      'postcss-selector-parser': ['7.1.6'],
      'proxy-addr': ['2.0.8'],
      sharp: ['0.35.5'],
      'smol-toml': ['1.9.1'],
      'source-map-js': ['1.2.2'],
      undici: ['6.29.1', '7.30.1', '8.12.2'],
      vite: ['8.3.5'],
      'body-parser': ['2.4.0'],
    })) {
      assert.deepEqual(
        [
          ...new Set(
            keys.filter((key) => key.startsWith(`${name}@`)).map((key) => key.split('(')[0]),
          ),
        ].sort(),
        versions.map((version) => `${name}@${version}`).sort(),
        `${sectionName}: ${name} must contain only the reviewed patched resolutions`,
      );
    }
    for (const key of keys.filter((key) => key.startsWith('@img/sharp-'))) {
      const expectedVersion = key.startsWith('@img/sharp-libvips-') ? '1.3.4' : '0.35.5';
      assert.ok(
        key.endsWith(`@${expectedVersion}`),
        `${sectionName}: outdated Sharp native package ${key}`,
      );
    }
    assert.ok(keys.includes('@img/sharp-linux-x64@0.35.5'));
    assert.ok(keys.includes('@img/sharp-libvips-linux-x64@1.3.4'));
  }
});
