import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKOUT_API,
  CheckoutError,
  checkoutPath,
  checkoutPrice,
  formatCheckoutAmount,
  getCheckoutStatus,
  isCheckoutId,
  isStripeCheckoutUrl,
  parseCheckoutSelection,
  startCardCheckout,
  startCryptoCheckout,
} from '../../src/lib/checkout';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('only known plans and periods are accepted from the address bar', () => {
  assert.deepEqual(parseCheckoutSelection('pro', 'yearly'), {
    plan: 'pro',
    sku: 'pro',
    period: 'yearly',
  });
  assert.deepEqual(parseCheckoutSelection('PLUS', null), {
    plan: 'plus',
    sku: 'plus',
    period: 'monthly',
  });
  assert.deepEqual(parseCheckoutSelection('enterprise-500000', 'monthly'), {
    plan: 'enterprise',
    sku: 'enterprise-500000',
    period: 'monthly',
  });
  assert.equal(parseCheckoutSelection('enterprise', 'x')?.sku, 'enterprise-150000');
  for (const bad of [
    'included',
    'free',
    'enterprise-100000',
    'enterprise-1',
    'pro;drop',
    '',
    null,
  ]) {
    assert.equal(parseCheckoutSelection(bad, 'monthly'), null, String(bad));
  }
  assert.equal(parseCheckoutSelection('max', 'weekly')?.period, 'monthly');
  assert.equal(checkoutPath({ sku: 'max', period: 'yearly' }), '/checkout?plan=max&period=yearly');
});

test('prices follow the shared catalog for the chosen period', () => {
  const amount = (plan: string, period: string) =>
    formatCheckoutAmount(checkoutPrice(parseCheckoutSelection(plan, period)!).amountAtomic);
  assert.equal(amount('plus', 'monthly'), '$4.90');
  assert.equal(amount('plus', 'yearly'), '$58.00');
  assert.equal(amount('max', 'monthly'), '$20.00');
  assert.equal(amount('enterprise-150000', 'yearly'), '$360.00');
  assert.equal(amount('enterprise-5000000', 'monthly'), '$1,000.00');
});

test('card checkout only ever redirects to Stripe', () => {
  assert.ok(isStripeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_live_abc#fid'));
  for (const bad of [
    'http://checkout.stripe.com/c/pay/x',
    'https://checkout.stripe.com.evil.example/c',
    'https://evil.example/?https://checkout.stripe.com',
    'https://user:pass@checkout.stripe.com/c',
    'https://checkout.stripe.com:8443/c',
    'javascript:alert(1)',
    '/dashboard',
  ]) {
    assert.equal(isStripeCheckoutUrl(bad), false, bad);
  }
});

test('checkout ids are validated before use in a URL', () => {
  assert.ok(isCheckoutId('chk_01HZX9ABCDEF'));
  for (const bad of ['short', '../../admin', 'a b c d e f g h', 'x'.repeat(81), null, undefined]) {
    assert.equal(isCheckoutId(bad), false, String(bad));
  }
});

test('card checkout sends the plan, never a price, with an idempotency key', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return json(200, {
      method: 'card',
      checkoutId: 'chk_12345678',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
  }) as typeof fetch;
  const result = await startCardCheckout(
    parseCheckoutSelection('pro', 'yearly')!,
    'key-1',
    fetcher,
  );
  assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_1');
  assert.equal(calls[0]?.url, CHECKOUT_API);
  assert.equal(calls[0]?.init.credentials, 'include');
  assert.equal((calls[0]?.init.headers as Record<string, string>)['Idempotency-Key'], 'key-1');
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    plan: 'pro',
    planSku: 'pro',
    period: 'yearly',
    method: 'card',
    autoRenew: true,
  });
});

test('a server answer pointing anywhere but Stripe is refused', async () => {
  const fetcher = (async () =>
    json(200, {
      method: 'card',
      checkoutId: 'chk_12345678',
      checkoutUrl: 'https://evil.example/pay',
    })) as unknown as typeof fetch;
  await assert.rejects(startCardCheckout(parseCheckoutSelection('pro', null)!, 'k', fetcher), {
    kind: 'unavailable',
  });
});

test('status codes become plain messages', async () => {
  for (const [status, kind] of [
    [401, 'signin'],
    [403, 'signin'],
    [422, 'invalid'],
    [409, 'conflict'],
    [404, 'unavailable'],
    [500, 'unavailable'],
  ] as const) {
    const fetcher = (async () => json(status, { error: 'X' })) as unknown as typeof fetch;
    await assert.rejects(
      startCardCheckout(parseCheckoutSelection('plus', null)!, 'k', fetcher),
      (error: unknown) =>
        error instanceof CheckoutError && error.kind === kind && !/X|\d{3}/.test(error.message),
    );
  }
  const offline = (async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
  await assert.rejects(startCardCheckout(parseCheckoutSelection('plus', null)!, 'k', offline), {
    kind: 'unavailable',
  });
});

test('crypto checkout signs the 402 requirement and retries with the same key', async () => {
  const keys: string[] = [];
  let call = 0;
  const fetcher = (async (_url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    keys.push(headers['Idempotency-Key']!);
    call += 1;
    if (call === 1) return new Response('{}', { status: 402 });
    assert.equal(headers['PAYMENT-SIGNATURE'], 'signed');
    return json(200, { method: 'crypto', checkoutId: 'chk_crypto_01' });
  }) as typeof fetch;
  const result = await startCryptoCheckout(
    parseCheckoutSelection('max', 'monthly')!,
    'key-9',
    async () => ({ 'PAYMENT-SIGNATURE': 'signed' }),
    fetcher,
  );
  assert.equal(result.checkoutId, 'chk_crypto_01');
  assert.deepEqual(keys, ['key-9', 'key-9']);
});

test('crypto checkout never accepts success without a payment requirement first', async () => {
  const fetcher = (async () =>
    json(200, { method: 'crypto', checkoutId: 'chk_12345678' })) as unknown as typeof fetch;
  await assert.rejects(
    startCryptoCheckout(parseCheckoutSelection('pro', null)!, 'k', async () => ({}), fetcher),
    { kind: 'unavailable' },
  );
});

test('status is read from the server and must match the checkout', async () => {
  const good = (async () =>
    json(200, {
      checkoutId: 'chk_12345678',
      status: 'paid',
      plan: 'pro',
      planSku: 'pro',
      period: 'monthly',
    })) as unknown as typeof fetch;
  assert.equal((await getCheckoutStatus('chk_12345678', undefined, good)).status, 'paid');
  const other = (async () =>
    json(200, {
      checkoutId: 'chk_87654321',
      status: 'paid',
      plan: 'pro',
      planSku: 'pro',
      period: 'monthly',
    })) as unknown as typeof fetch;
  await assert.rejects(getCheckoutStatus('chk_12345678', undefined, other), {
    kind: 'unavailable',
  });
  await assert.rejects(getCheckoutStatus('../admin', undefined, good), { kind: 'invalid' });
  const unknown = (async () => json(404, {})) as unknown as typeof fetch;
  await assert.rejects(getCheckoutStatus('chk_12345678', undefined, unknown), { kind: 'invalid' });
});
