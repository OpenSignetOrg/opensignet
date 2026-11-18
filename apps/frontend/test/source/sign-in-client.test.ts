import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SignInError,
  createSignInClient,
  googleStartUrl,
  normalizeDisplayName,
  normalizeEmail,
  safeReturnPath,
} from '../../src/lib/sign-in-client';

test('return paths stay on this site and never loop back to sign-in', () => {
  assert.equal(
    safeReturnPath('/checkout?plan=pro&period=monthly'),
    '/checkout?plan=pro&period=monthly',
  );
  for (const unsafe of [
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example',
    'javascript:alert(1)',
    '/sign-in',
    '/sign-in?return_to=/x',
    '/a\u0000b',
    `/${'a'.repeat(600)}`,
    '',
    null,
    undefined,
  ])
    assert.equal(safeReturnPath(unsafe), '/dashboard', String(unsafe));
  assert.equal(
    googleStartUrl('//evil.example'),
    '/api/v1/auth/google/start?return_to=%2Fdashboard',
  );
});

test('emails are trimmed and lower-cased; malformed input is refused', () => {
  assert.equal(normalizeEmail('  Name@Example.COM '), 'name@example.com');
  for (const bad of [
    '',
    'name',
    'name@',
    '@example.com',
    'a b@example.com',
    'name@example',
    `${'a'.repeat(250)}@x.io`,
  ])
    assert.equal(normalizeEmail(bad), null, bad);
});

test('display names are normalized and limited to 50 characters', () => {
  assert.equal(normalizeDisplayName('  Md.   Rakib  '), 'Md. Rakib');
  assert.equal(normalizeDisplayName('ｒａｋｉｂ'), 'rakib');
  assert.equal(normalizeDisplayName('   '), null);
  assert.equal(normalizeDisplayName('a\u0007b'), null);
  assert.equal(normalizeDisplayName('x'.repeat(50)), 'x'.repeat(50));
  assert.equal(normalizeDisplayName('x'.repeat(51)), null);
});

test('the client maps server errors to plain-language messages and validates answers', async () => {
  const respond =
    (status: number, body: unknown): typeof fetch =>
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

  const wrong = createSignInClient(respond(400, { error: 'invalid_code', attemptsRemaining: 1 }));
  await assert.rejects(wrong.verifyEmail('111111'), (error: unknown) => {
    assert.ok(error instanceof SignInError);
    assert.equal(error.code, 'invalid_code');
    assert.equal(error.message, 'That code isn’t right. 1 try left.');
    return true;
  });

  const limited = createSignInClient(
    respond(429, { error: 'rate_limited', retryAfterSeconds: 90 }),
  );
  await assert.rejects(limited.startEmail('a@b.co', 't'), /Try again in 2 minutes\./);

  const outage = createSignInClient(respond(503, '<html>'));
  await assert.rejects(outage.session(), (error: unknown) => {
    assert.ok(error instanceof SignInError);
    assert.equal(error.code, 'unavailable');
    return true;
  });

  // A success body that does not match the contract is treated as an outage, never trusted.
  const malformed = createSignInClient(respond(200, { authenticated: true }));
  await assert.rejects(malformed.session(), /temporarily unavailable/);

  const offline = createSignInClient(async () => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(offline.session(), /temporarily unavailable/);

  const signedIn = createSignInClient(
    respond(200, {
      authenticated: true,
      account: {
        id: 'a1',
        displayName: null,
        email: 'a@b.co',
        avatarUrl: null,
        onboarding: 'name',
      },
    }),
  );
  const session = await signedIn.session();
  assert.equal(session.authenticated && session.account.onboarding, 'name');
});
