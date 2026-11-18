import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { scripts, dependencies } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

test('standalone Astro and machine-docs commands build the public schema first', () => {
  assert.equal(dependencies['@opensignet/shared'], 'workspace:*');
  assert.equal(scripts['build:dependencies'], 'pnpm --filter @opensignet/shared build');
  for (const command of ['dev', 'build', 'typecheck', 'test', 'validate:output']) {
    assert.ok(
      scripts[command].startsWith('pnpm run build:dependencies && '),
      `${command} must not depend on another workspace task having built shared`,
    );
  }
});

test('every command that reads brand files first generates them from the repository brand/', () => {
  assert.equal(scripts['sync:brand'], 'node ../../scripts/sync-brand.ts docs');
  for (const command of ['dev', 'build', 'typecheck', 'test', 'lint', 'validate:content']) {
    assert.match(
      scripts[command],
      /(?:^|&& )node \.\.\/\.\.\/scripts\/sync-brand\.ts docs && /,
      `${command} must sync the generated brand mirror first`,
    );
  }
});

test('production and preview entrypoints retain validation and release gates', () => {
  assert.equal(
    scripts['build:cloudflare:production'],
    'node ../../scripts/seo/indexnow.ts verify --site=docs --production && pnpm run check',
  );
  assert.equal(
    scripts.check,
    'pnpm run validate:content && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run validate:output',
  );
  assert.match(scripts.preview, /^pnpm run build && wrangler dev --env preview$/);
  assert.match(scripts.deploy, /^pnpm run check && /);
});
