import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import openSignetPlugin, { quoteRegistrationAction } from '../dist/index.js';

const originalFetch = globalThis.fetch;
const agentId = '3f2a9c1e-7b4d-4c2a-9e1f-0a1b2c3d4e5f';

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function runtime(settings: Record<string, string> = {}) {
  return { getSetting: (key: string): string | undefined => settings[key] };
}

interface CapturedRequest {
  url: URL;
  init: RequestInit | undefined;
}

function capture(response: unknown) {
  const requests: CapturedRequest[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return Response.json(response);
  };
  return requests;
}

const quote = {
  domain: 'promptbot.xyz',
  domainCostUsdc: '2.18',
  totalUsdc: '2.18',
};

async function quotedParams(text: string) {
  const requests = capture(quote);
  await quoteRegistrationAction.handler(runtime(), { content: { text } });
  assert.equal(requests.length, 1);
  return requests[0]!.url.searchParams;
}

describe('Eliza registration intents', () => {
  it('does not add ENS from domain labels or ordinary words', async () => {
    const params = await quotedParams(
      'Quote promptbot.xyz for 2 years and provide a professional summary for my-ens-agent.xyz',
    );
    assert.equal(params.get('preferredName'), 'promptbot');
    assert.equal(params.get('tld'), 'xyz');
    assert.equal(params.get('years'), '2');
    assert.equal(params.get('premiumPlan'), null);
    assert.equal(params.get('registerEns'), 'false');
  });

  it('adds ENS when named, and never sends a plan with a registration', async () => {
    const params = await quotedParams('Quote helper.ai with the Pro plan and ENS');
    assert.equal(params.get('premiumPlan'), null);
    assert.equal(params.get('registerEns'), 'true');
  });

  it('offers no plan purchase or renewal-plan actions', () => {
    const names = openSignetPlugin.actions.map((action) => action.name);
    assert.ok(!names.includes('PURCHASE_SERVICE_PLAN'));
    assert.ok(!names.includes('SCHEDULE_SERVICE_PLAN_RENEWAL'));
    assert.ok(names.includes('GET_SERVICE_PLAN'));
  });

  it('lists every paid line in the quote reply', async () => {
    capture({
      ...quote,
      domain: 'helper.ai',
      basenameCostUsdc: '10.12',
      ensCostUsdc: '13.48',
      totalUsdc: '25.78',
    });
    const reply = await quoteRegistrationAction.handler(runtime(), {
      content: { text: 'Quote helper.ai for 2 years with Basename and ENS' },
    });
    assert.equal(
      reply.text,
      'Total: $25.78 USDC for helper.ai (2 years). Domain $2.18, Basename $10.12, ENS $13.48; email is included.',
    );
  });

  it('declines both add-ons when one negation lists them', async () => {
    const params = await quotedParams(
      'Quote research-agent.xyz for 1 year without Basename or ENS',
    );
    assert.equal(params.get('registerBasename'), 'false');
    assert.equal(params.get('registerEns'), 'false');
  });

  it('requires a full domain instead of quoting a default name', async () => {
    const requests = capture(quote);
    await assert.rejects(
      quoteRegistrationAction.handler(runtime(), { content: { text: 'Quote an agent name' } }),
      /Include the full domain/,
    );
    assert.equal(requests.length, 0);
  });
});
