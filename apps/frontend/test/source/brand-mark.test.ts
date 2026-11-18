import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  MARK_ENDPOINT,
  MARK_GROUP_TRANSFORM,
  MARK_MIRROR_TRANSFORM,
  MARK_SIDE_PATH,
  MARK_STEM_PATH,
} from '../../src/lib/brand-mark-geometry';

test('the transparent header mark uses the approved opensignet-logo.svg geometry unchanged', () => {
  const logo = readFileSync(
    new URL('../../../../brand/logo/opensignet-logo.svg', import.meta.url),
    'utf8',
  );
  assert.ok(logo.includes(`<g transform="${MARK_GROUP_TRANSFORM}">`));
  assert.equal(logo.split(`<path d="${MARK_SIDE_PATH}"`).length - 1, 2);
  assert.ok(logo.includes(`transform="${MARK_MIRROR_TRANSFORM}"`));
  assert.ok(logo.includes(`<path d="${MARK_STEM_PATH}"`));
  assert.ok(
    logo.includes(
      `<circle id="endpoint-circle" cx="${MARK_ENDPOINT.cx}" cy="${MARK_ENDPOINT.cy}" r="${MARK_ENDPOINT.r}"`,
    ),
  );
  const component = readFileSync(
    new URL('../../src/components/brand/brand-mark.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(component, /<rect|<image|rounded|bg-/);
});
