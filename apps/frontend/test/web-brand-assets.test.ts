import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadSharp } from '../scripts/sharp.ts';
import { frontendRoot, readBrandConfig, repositoryRoot } from '../scripts/verify-assets.ts';

const sharp = loadSharp();
const read = (file: string) => readFileSync(resolve(frontendRoot, file));
const brand = readBrandConfig();

function asset(name: string): string {
  const path = brand.assets[name];
  assert.ok(path, `Missing brand asset mapping: ${name}`);
  return `public${path}`;
}

test('ICO wraps real transparent 16/32/48px PNG layers byte-for-byte', () => {
  const ico = read(asset('faviconIco'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  let offset = 54;
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    assert.equal(ico.readUInt16LE(entry + 4), 1);
    assert.equal(ico.readUInt32LE(entry + 12), offset);
    const original = read(asset(`favicon${size}`));
    assert.equal(original[25], 6, 'favicon frames keep an alpha channel');
    assert.equal(ico.readUInt32LE(entry + 8), original.length);
    assert.deepEqual(ico.subarray(offset, offset + original.length), original);
    offset += original.length;
  }
  assert.equal(offset, ico.length);
  assert.equal(brand.aliases['/favicon.ico'], undefined, 'The real favicon is never a redirect');
  assert.match(
    read('public/_headers').toString(),
    /\/favicon\.ico\r?\n\s+Content-Type: image\/x-icon/,
  );
});

test('social delivery copy preserves dimensions and visual fidelity within 600KB', async () => {
  const original = read(asset('socialCardOriginal'));
  const delivery = read(asset('socialCard'));
  assert.ok(delivery.length < 600_000);
  assert.equal(delivery.subarray(0, 3).toString('hex'), 'ffd8ff');
  assert.equal(brand.socialImage.type, 'image/jpeg');
  const source = await sharp(original).raw().toBuffer({ resolveWithObject: true });
  const target = await sharp(delivery).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual(target.info, source.info);
  assert.equal(target.info.width, brand.socialImage.width);
  assert.equal(target.info.height, brand.socialImage.height);
  let error = 0;
  for (let index = 0; index < source.data.length; index++) {
    error += Math.abs((source.data[index] ?? 0) - (target.data[index] ?? 0));
  }
  assert.ok(error / source.data.length < 1, 'Mean decoded channel error must stay below 1/255');
});

test('favicons are transparent and the SVG adapts its ink to dark browser tabs', () => {
  const svg = read(asset('faviconSvg')).toString();
  // Dark tabs switch both the mark and the small-size stem outline to the light ink.
  assert.ok(
    svg.includes('@media (prefers-color-scheme:dark){g{fill:#f3f1ec}[stroke]{stroke:#f3f1ec}}'),
  );
  // Small-size hinting only outlines the stem; the panels and endpoint keep the exact geometry.
  assert.equal((svg.match(/stroke-width="/g) ?? []).length, 1);
  assert.doesNotMatch(svg, /<rect/);
  const logo = readFileSync(resolve(repositoryRoot, 'brand/logo/opensignet-logo.svg')).toString();
  for (const path of svg.match(/ d="[^"]+"/g) ?? [])
    assert.ok(logo.includes(path), 'mark geometry');
  for (const name of ['favicon16', 'favicon32', 'favicon', 'appIcon192', 'appIcon512']) {
    assert.equal(read(asset(name))[25], 6, `${name} keeps transparency`);
  }
  // iOS and Android maskable icons need an opaque background by platform rule.
  assert.match(asset('appleTouchIcon'), /apple-touch-icon-180\.png$/);
  assert.match(asset('maskableIcon'), /icon-maskable-512\.png$/);
});
