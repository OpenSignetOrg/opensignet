import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  encodeBuilderCodeSuffix,
  parseBuilderCodeSuffixFromCalldata,
} from '@x402/extensions/builder-code';
import { OpenSignet, appendBuilderCodeAttribution } from '../dist/index.js';

const builderCode = 'opensignet_test';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('public API default', () => {
  it('uses the canonical API subdomain', async () => {
    let requestedUrl: string | undefined;
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ available: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const ad = new OpenSignet();
    await ad.checkAvailability('research-agent', { tld: 'xyz' });

    assert.equal(
      requestedUrl,
      'https://api.opensignet.com/api/v1/domains/availability?name=research-agent&tld=xyz',
    );
  });
});

describe('ERC-8021 builder-code attribution helpers', () => {
  it('preserves matching attribution and rejects invalid or conflicting attribution', () => {
    const baseData = '0x12345678';
    const attributed = appendBuilderCodeAttribution(baseData, builderCode);
    assert.equal(appendBuilderCodeAttribution(attributed, builderCode), attributed);
    assert.throws(
      () => appendBuilderCodeAttribution(attributed, 'other_builder'),
      /different builder-code attribution/,
    );
    assert.throws(() => appendBuilderCodeAttribution(baseData, 'INVALID-CODE'), /1-32 lowercase/);
  });

  it('recognizes a suffix produced directly by the official encoder', () => {
    const suffix = encodeBuilderCodeSuffix({ a: builderCode });
    assert.deepEqual(parseBuilderCodeSuffixFromCalldata(`0x12345678${suffix.slice(2)}`), {
      a: builderCode,
    });
  });
});
