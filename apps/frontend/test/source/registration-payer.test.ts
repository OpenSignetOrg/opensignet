import assert from 'node:assert/strict';
import test from 'node:test';
import { createWalletPaymentHeaders } from '../../src/lib/registration-payer';

const payer = '0x1111111111111111111111111111111111111111';
const treasury = '0x2222222222222222222222222222222222222222';
const binding = `0x${'ab'.repeat(32)}`;

function priced(extraBody: Record<string, unknown> = {}) {
  const quoteExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const requirement = {
    x402Version: 2,
    accepts: [
      {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '20880000',
        payTo: treasury,
        extra: { requestBinding: binding, quoteExpiresAt, registrationQuote: 'rq1.fixture' },
      },
    ],
  };
  return new Response(JSON.stringify({ error: 'payment_required', ...extraBody }), {
    status: 402,
    headers: { 'PAYMENT-REQUIRED': btoa(JSON.stringify(requirement)) },
  });
}

test('pays the exact priced transfer from the OpenSignet wallet and carries the renewal permission', async (context) => {
  const sent: Array<Record<string, unknown>> = [];
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, '/api/v1/wallet/payments');
    assert.equal(options.method, 'POST');
    sent.push(JSON.parse(String(options.body)) as Record<string, unknown>);
    return Response.json({ signature: `0x${'cd'.repeat(65)}`, authorization: {} });
  });
  const renews = {
    item: 'domain:fixture.com',
    maxCharge: '13050000',
    minGapDays: 300,
    label: 'fixture.com',
  };
  const headers = await createWalletPaymentHeaders(
    priced({ walletRenews: renews }),
    payer,
    'fixture.com, 2 years',
  );
  const payment = (sent[0] as { payment: Record<string, unknown> }).payment;
  assert.equal(payment.to, treasury);
  assert.equal(payment.value, '20880000');
  assert.equal(payment.nonce, binding);
  assert.equal(payment.summary, 'fixture.com, 2 years');
  assert.deepEqual(payment.renews, renews);
  const now = Math.floor(Date.now() / 1000);
  assert.ok(Number(payment.validBefore) > now + 30 && Number(payment.validBefore) <= now + 600);

  const decoded = JSON.parse(atob(headers['PAYMENT-SIGNATURE']!)) as {
    x402Version: number;
    accepted: { amount: string };
    payload: { authorization: Record<string, string>; signature: string };
  };
  assert.equal(decoded.x402Version, 2);
  assert.equal(decoded.accepted.amount, '20880000');
  assert.deepEqual(decoded.payload.authorization, {
    from: payer,
    to: treasury,
    value: '20880000',
    validAfter: '0',
    validBefore: payment.validBefore,
    nonce: binding,
  });
  assert.equal(decoded.payload.signature, `0x${'cd'.repeat(65)}`);
});

test('without a renewal offer, only the payment is asked; a bad requirement is refused unpaid', async (context) => {
  const sent: Array<{ payment: Record<string, unknown> }> = [];
  context.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    sent.push(JSON.parse(String(options.body)) as { payment: Record<string, unknown> });
    return Response.json({ signature: `0x${'cd'.repeat(65)}`, authorization: {} });
  });
  await createWalletPaymentHeaders(priced(), payer, 'fixture.com, 1 year');
  assert.equal('renews' in sent[0]!.payment, false);

  const broken = new Response('{}', {
    status: 402,
    headers: { 'PAYMENT-REQUIRED': btoa(JSON.stringify({ accepts: [{ amount: 'x' }] })) },
  });
  await assert.rejects(createWalletPaymentHeaders(broken, payer, 'fixture.com, 1 year'));
  assert.equal(sent.length, 1);
});
