import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  declinesAutoRenew,
  openSignetPlugin,
  renewalStatusAction,
  setAutoRenewAction,
  wantsAutoRenew,
} from '../dist/index.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const agentId = '22222222-2222-4222-8222-222222222222';
const apiUrl = 'https://api.example.test/api/v1';
const settings: Record<string, string> = {
  OPENSIGNET_API_URL: apiUrl,
  OPENSIGNET_API_KEY: 'fixture',
};
const runtime = { getSetting: (name: string): string | undefined => settings[name] };

test('renewal status reads the API and explains what stands in the way', async () => {
  let requested = '';
  globalThis.fetch = async (input) => {
    requested = String(input);
    return Response.json({
      agentId,
      domain: 'renews.xyz',
      autoRenew: false,
      method: 'wallet',
      price: '10440000',
      ready: false,
      issue: { code: 'auto_renew_off', message: 'Automatic renewal is off.' },
    });
  };
  const result = await renewalStatusAction.handler(runtime, {
    content: { text: `renewal for ${agentId}` },
  });
  assert.equal(requested, `${apiUrl}/agents/${agentId}/renewal`);
  assert.equal(
    result.text,
    'renews.xyz does not renew automatically ($10.44 a year). Automatic renewal is off.',
  );
});

test('the on/off action reads the person’s intent', () => {
  assert.equal(wantsAutoRenew('turn on auto renew'), true);
  assert.equal(wantsAutoRenew('renew it automatically'), true);
  for (const off of ['turn off auto renew', 'stop renewing', 'disable auto-renew', 'don’t renew']) {
    assert.equal(wantsAutoRenew(off), false, off);
  }
});

test('switching renewal calls the API with the identity’s key', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push(
      `${init.method ?? 'GET'} ${String(input)} ${new Headers(init.headers).get('Authorization')}`,
    );
    return Response.json({ domain: 'renews.xyz', autoRenew: !String(input).endsWith('/off') });
  };
  const off = await setAutoRenewAction.handler(runtime, {
    content: { text: `turn off auto renew for ${agentId}` },
  });
  const on = await setAutoRenewAction.handler(runtime, {
    content: { text: `turn on auto renew for ${agentId}` },
  });
  assert.match(off.text, /no longer renews automatically/);
  assert.match(on.text, /now renews automatically/);
  assert.deepEqual(calls, [
    `POST ${apiUrl}/agents/${agentId}/domain/auto-renew/off Bearer fixture`,
    `POST ${apiUrl}/agents/${agentId}/domain/auto-renew Bearer fixture`,
  ]);
});

test('the plugin offers no vault actions any more', () => {
  const names = openSignetPlugin.actions.map((action) => action.name);
  assert.ok(names.includes('SET_AUTO_RENEW'));
  for (const retired of ['FUND_RENEWAL_VAULT', 'ENABLE_AUTO_RENEW']) {
    assert.ok(!names.includes(retired), retired);
  }
});

test('registrations renew automatically unless the request declines it', () => {
  for (const text of ['Register reader.xyz', 'Register reader.xyz with auto-renew']) {
    assert.equal(declinesAutoRenew(text), false, text);
  }
  for (const text of [
    'Register reader.xyz without auto-renew',
    'Register reader.xyz, no auto renew',
    'Register reader.xyz with auto-renewal off',
    'Register reader.xyz and don’t auto renew it',
  ]) {
    assert.equal(declinesAutoRenew(text), true, text);
  }
});
