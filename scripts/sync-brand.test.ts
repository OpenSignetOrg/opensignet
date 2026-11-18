import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { assertBrandMirrors, brandTargets, listBrandFiles, syncBrand } from './sync-brand.ts';

const KIT = {
  'brand/README.md': '# kit\n',
  'brand/logo/opensignet-logo.svg': '<svg/>\n',
  'brand/logo/opensignet-mark.svg': '<svg id="dark-ink"/>\n',
  'brand/logo/opensignet-mark-on-dark.svg': '<svg id="light-ink"/>\n',
  'brand/icons/favicon.svg': '<svg id="favicon"/>\n',
  'brand/icons/favicon.ico': 'ico',
  'brand/icons/favicon-96.png': 'png-96',
  'brand/social/opensignet-docs-social-card.png': 'docs-card',
} as const;

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'opensignet-sync-brand-'));
  for (const [file, content] of Object.entries(KIT)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

function counts(root: string, check = false) {
  return syncBrand({ root, check }).map(({ target, written, unchanged, removed }) => ({
    target,
    written: written.length,
    unchanged,
    removed: removed.length,
  }));
}

test('sync mirrors the kit, skips unchanged files and removes stale copies', (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(counts(root, true), [
    { target: 'frontend', written: 8, unchanged: 0, removed: 0 },
    { target: 'docs', written: 5, unchanged: 0, removed: 0 },
  ]);
  assert.equal(existsSync(join(root, 'apps/frontend/public/favicon.ico')), false, 'check is dry');
  assert.throws(() => assertBrandMirrors(['frontend'], root), /Generated brand mirrors are stale/);

  assert.deepEqual(counts(root), [
    { target: 'frontend', written: 8, unchanged: 0, removed: 0 },
    { target: 'docs', written: 5, unchanged: 0, removed: 0 },
  ]);
  assert.equal(readFileSync(join(root, 'apps/frontend/public/favicon.ico'), 'utf8'), 'ico');
  assert.equal(
    readFileSync(join(root, 'apps/docs/src/assets/brand/logo/opensignet-mark.svg'), 'utf8'),
    KIT['brand/logo/opensignet-mark.svg'],
  );
  assert.equal(existsSync(join(root, 'apps/frontend/public/brand/README.md')), false);
  assert.doesNotThrow(() => assertBrandMirrors(undefined, root));

  assert.deepEqual(counts(root), [
    { target: 'frontend', written: 0, unchanged: 8, removed: 0 },
    { target: 'docs', written: 0, unchanged: 5, removed: 0 },
  ]);

  // A hand-edited copy is restored; a copy of a file removed from brand/ is deleted.
  writeFileSync(join(root, 'apps/frontend/public/brand/icons/favicon.svg'), 'edited');
  rmSync(join(root, 'brand/logo/opensignet-logo.svg'));
  mkdirSync(join(root, 'apps/frontend/public/brand/legacy'), { recursive: true });
  writeFileSync(join(root, 'apps/frontend/public/brand/legacy/old-name.png'), 'old');
  assert.deepEqual(counts(root)[0], { target: 'frontend', written: 1, unchanged: 6, removed: 2 });
  assert.equal(
    readFileSync(join(root, 'apps/frontend/public/brand/icons/favicon.svg'), 'utf8'),
    KIT['brand/icons/favicon.svg'],
  );
  assert.equal(
    existsSync(join(root, 'apps/frontend/public/brand/logo/opensignet-logo.svg')),
    false,
  );
  assert.equal(existsSync(join(root, 'apps/frontend/public/brand/legacy')), false);
  assert.doesNotThrow(() => assertBrandMirrors(undefined, root));
});

test('sync can target one app and rejects a kit missing a file an app needs', (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(
    syncBrand({ root, targets: ['docs'] }).map(({ target }) => target),
    ['docs'],
  );
  assert.equal(existsSync(join(root, 'apps/frontend/public/brand')), false);
  rmSync(join(root, 'brand/social/opensignet-docs-social-card.png'));
  assert.throws(() => brandTargets(root), /Missing canonical brand file/);
});

test('the repository kit is mirrored whole into the frontend and in part into the docs', () => {
  const kit = listBrandFiles();
  assert.ok(kit.length > 0);
  assert.ok(!kit.includes('brand/README.md'));
  const [frontend, docs] = brandTargets();
  assert.ok(frontend && docs);
  assert.deepEqual(
    frontend.files.map(({ source }) => source),
    [...kit, 'brand/icons/favicon.ico'],
  );
  for (const { source, target } of frontend.files) {
    if (target !== 'apps/frontend/public/favicon.ico')
      assert.equal(target, `apps/frontend/public/${source}`);
  }
  assert.deepEqual(
    docs.files.map(({ target }) => target),
    [
      'apps/docs/public/brand/icons/favicon.svg',
      'apps/docs/public/brand/icons/favicon-96.png',
      'apps/docs/public/brand/social/opensignet-docs-social-card.png',
      'apps/docs/src/assets/brand/logo/opensignet-mark.svg',
      'apps/docs/src/assets/brand/logo/opensignet-mark-on-dark.svg',
    ],
  );
});
