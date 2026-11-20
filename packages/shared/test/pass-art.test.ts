import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { middleTruncate, renderPassSvg, PASS_ART_SIZE } from '../dist/index.js';
import { renderPassSvg as subpathRender } from '../dist/pass-art.js';

describe('OpenSignet Pass artwork', () => {
  const full = {
    number: 42,
    domain: 'Northwind.AI',
    basename: 'northwind.base.eth',
    ens: 'northwind.eth',
  };

  it('is a square SVG that draws the same bytes for the same pass', () => {
    const svg = renderPassSvg(full);
    assert.equal(subpathRender, renderPassSvg);
    assert.equal(svg, renderPassSvg(full));
    assert.match(svg, new RegExp(`^<svg [^>]*viewBox="0 0 ${PASS_ART_SIZE} ${PASS_ART_SIZE}"`));
    assert.ok(svg.endsWith('</svg>'));
  });

  it('shows the name, the pass number and the three linked forms, lower-cased', () => {
    const svg = renderPassSvg(full);
    assert.ok(svg.includes('>northwind<'));
    assert.ok(svg.includes('No. 000042'));
    for (const value of ['northwind.ai', 'northwind.base.eth', 'northwind.eth'])
      assert.ok(svg.includes(`>${value}<`), value);
    assert.ok(!svg.includes('Not linked'));
  });

  it('marks forms that are not linked yet', () => {
    const svg = renderPassSvg({ number: 7, domain: 'hello.com', basename: null });
    assert.equal(svg.split('>Not linked<').length - 1, 2);
  });

  it('keeps long names readable and never lets text break the markup', () => {
    const long = `${'a'.repeat(60)}.com`;
    const svg = renderPassSvg({ number: 1, domain: long });
    // The visible name is cut in the middle; the accessible label keeps the full domain.
    assert.ok(svg.includes(`>${middleTruncate('a'.repeat(60), 30)}<`));
    assert.ok(svg.includes(`aria-label="OpenSignet Pass No. 000001 for ${long}"`));
    assert.equal(middleTruncate('research-assistant-labs.xyz', 22), 'research-as…t-labs.xyz');
    const hostile = renderPassSvg({ number: 1, domain: 'x.com', ens: '<script>"&\'' });
    assert.ok(!hostile.includes('<script>'));
    assert.ok(hostile.includes('&lt;script&gt;&quot;&amp;&apos;'));
  });
});
