import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  NPM_PACKAGES,
  ReleaseError,
  archiveName,
  assertUnpublished,
  coordinatedVersion,
  inspectNpmArchive,
  pyprojectVersion,
  readTarGz,
  stableVersion,
} from './release.ts';

const LICENSE = 'Apache License\nVersion 2.0, January 2004\n';

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

/** Builds a minimal ustar archive so the inspector is tested without network or pnpm. */
function tarGz(entries: { path: string; content?: string; type?: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const { path, content = '', type = '0' } of entries) {
    const body = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(path, 0, 100, 'utf8');
    header.write(octal(0o644, 8), 100, 'ascii');
    header.write(octal(0, 8), 108, 'ascii');
    header.write(octal(0, 8), 116, 'ascii');
    header.write(octal(body.length, 12), 124, 'ascii');
    header.write(octal(0, 12), 136, 'ascii');
    header.write('        ', 148, 'ascii');
    header.write(type, 156, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(octal(checksum, 7), 148, 'ascii');
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function packageArchive(
  manifest: Record<string, unknown>,
  extra: { path: string; content?: string; type?: string }[] = [],
): Buffer {
  return tarGz([
    { path: 'package/package.json', content: JSON.stringify(manifest) },
    { path: 'package/LICENSE', content: LICENSE },
    { path: 'package/NOTICE', content: 'OpenSignet\n' },
    { path: 'package/README.md', content: '# sdk\n' },
    { path: 'package/dist/index.js', content: 'export {};\n' },
    { path: 'package/dist/index.d.ts', content: 'export {};\n' },
    ...extra,
  ]);
}

const sdk = {
  name: '@opensignet/sdk',
  version: '0.1.0',
  license: 'Apache-2.0',
  dependencies: { '@opensignet/shared': '^0.1.0', viem: '^2.56.3' },
};

test('the repository carries one coordinated stable version with a changelog entry', () => {
  assert.match(coordinatedVersion(), /^\d+\.\d+\.\d+$/);
});

test('stable versions and pyproject metadata are parsed strictly', () => {
  assert.equal(stableVersion('0.1.0', 'x'), '0.1.0');
  for (const value of ['0.1', '01.0.0', '0.1.0-rc.1', 1]) {
    assert.throws(() => stableVersion(value, 'x'), ReleaseError);
  }
  assert.deepEqual(
    pyprojectVersion(
      '[build-system]\nrequires = []\n\n[project]\nname = "opensignet-crewai"\nversion = "0.1.0"\n\n[project.urls]\n',
      'p',
    ),
    { name: 'opensignet-crewai', version: '0.1.0' },
  );
  assert.throws(() => pyprojectVersion('[tool.x]\nversion = "0.1.0"\n', 'p'), ReleaseError);
});

test('a well-formed packed archive passes inspection', () => {
  const entries = inspectNpmArchive(packageArchive(sdk), 'sdk', '0.1.0');
  assert.ok(entries.some((entry) => entry.path === 'package/dist/index.js'));
});

test('archives keeping workspace protocols or mismatched internal versions are refused', () => {
  assert.throws(
    () =>
      inspectNpmArchive(
        packageArchive({ ...sdk, dependencies: { '@opensignet/shared': 'workspace:^' } }),
        'sdk',
        '0.1.0',
      ),
    /local protocol/,
  );
  assert.throws(
    () =>
      inspectNpmArchive(
        packageArchive({ ...sdk, dependencies: { '@opensignet/shared': '^0.0.9' } }),
        'sdk',
        '0.1.0',
      ),
    /coordinated version/,
  );
  assert.throws(() => inspectNpmArchive(packageArchive(sdk), 'sdk', '0.2.0'), /mismatch/);
});

test('secrets, links, escaping paths and missing license files are refused', () => {
  for (const extra of [
    { path: 'package/.env', content: 'X=1' },
    { path: 'package/dist/key.pem', content: 'x' },
    { path: 'package/.npmrc', content: '//registry/:_authToken=x' },
    { path: '../outside.js', content: 'x' },
  ]) {
    assert.throws(
      () => inspectNpmArchive(packageArchive(sdk, [extra]), 'sdk', '0.1.0'),
      ReleaseError,
    );
  }
  assert.throws(
    () => readTarGz(tarGz([{ path: 'package/link', type: '2' }])),
    /not a regular file/,
  );
  const withoutLicense = tarGz([
    { path: 'package/package.json', content: JSON.stringify(sdk) },
    { path: 'package/NOTICE', content: 'n' },
  ]);
  assert.throws(() => inspectNpmArchive(withoutLicense, 'sdk', '0.1.0'), /LICENSE/);
});

test('registry check refuses an already published version and unexpected responses', async () => {
  const seen: string[] = [];
  await assertUnpublished('0.1.0', async (name, version) => {
    seen.push(`${name}@${version}`);
    return 404;
  });
  assert.deepEqual(
    seen,
    NPM_PACKAGES.map((slug) => `@opensignet/${slug}@0.1.0`),
  );
  await assert.rejects(
    assertUnpublished('0.1.0', async (name) => (name === '@opensignet/sdk' ? 200 : 404)),
    /already published.*@opensignet\/sdk@0\.1\.0/,
  );
  await assert.rejects(
    assertUnpublished('0.1.0', async () => 503),
    /HTTP 503/,
  );
});

test('archive names follow pnpm pack naming for the scope', () => {
  assert.equal(archiveName('mcp-server', '0.1.0'), 'opensignet-mcp-server-0.1.0.tgz');
});
