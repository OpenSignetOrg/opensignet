import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { OpenSignet } from '../dist/index.js';
import { bodyText, headerRecord } from './helpers.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function capture(answer: object, status = 201) {
  const calls: { body: unknown; headers: Record<string, string | undefined> }[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: JSON.parse(bodyText(init)), headers: headerRecord(init) });
    return new Response(JSON.stringify(answer), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return calls;
}

const client = () =>
  new OpenSignet({ apiKey: 'osk_test', apiUrl: 'https://api.example.test/api/v1' });

test('the idempotency key travels as a header and never in the message body', async () => {
  const calls = capture({ id: 'm1', status: 'queued', messages: [] });
  await client().sendEmail('agent', {
    to: 'ops@example.com',
    subject: 'Status',
    text: 'Online.',
    idempotencyKey: 'key-1',
  });
  assert.equal(calls[0]?.headers['Idempotency-Key'], 'key-1');
  assert.deepEqual(calls[0]?.body, { to: 'ops@example.com', subject: 'Status', text: 'Online.' });
});

test('a send time given as a Date is sent as an ISO time, in single sends and batches', async () => {
  const at = new Date('2026-12-01T09:00:00.000Z');
  const single = capture({ id: 'm1', status: 'scheduled', messages: [] });
  await client().sendEmail('agent', {
    to: 'a@example.com',
    subject: 's',
    html: '<p>x</p>',
    sendAt: at,
  });
  assert.equal((single[0]?.body as { sendAt: string }).sendAt, '2026-12-01T09:00:00.000Z');

  const batch = capture({ status: 'queued', jobs: [], errors: [] }, 202);
  await client().sendEmailBatch('agent', {
    messages: [{ to: 'a@example.com', subject: 's', text: 'x', sendAt: at }],
    validationMode: 'partial',
    idempotencyKey: 'key-2',
  });
  assert.equal(batch[0]?.headers['Idempotency-Key'], 'key-2');
  assert.deepEqual(batch[0]?.body, {
    messages: [
      { to: 'a@example.com', subject: 's', text: 'x', sendAt: '2026-12-01T09:00:00.000Z' },
    ],
    validationMode: 'partial',
  });
});
