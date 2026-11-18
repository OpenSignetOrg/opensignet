import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { boxOf, browserLaunchOptions, loadChromium } from './support/playwright.ts';

const chromium = loadChromium();
const origin = process.env.FRONTEND_TEST_ORIGIN ?? 'http://127.0.0.1:3016';
const payer = `0x${'1'.repeat(40)}`;
const other = `0x${'2'.repeat(40)}`;
const startedAt = new Date(Date.now() - 125_000).toISOString();
const attempt = {
  wallet: payer,
  domain: 'synthetic-registration.test',
  clientId: `${Date.parse(startedAt)}-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
};
interface RegistrationRecordFixture {
  registrationId: string;
  statusUrl: string;
  status: string;
  domain: string;
  agentId: string | null;
  paymentStatus: string;
  stage: string;
  messageCode: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  revision: number;
  estimatedDurationSeconds: number | null;
  pollAfterSeconds: number;
  completionEventId: string | null;
}
interface JsonRpcRequest {
  id: number | string;
}
const record: RegistrationRecordFixture = {
  registrationId: '00000000-0000-4000-8000-000000000001',
  statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000001',
  status: 'processing',
  domain: attempt.domain,
  agentId: null,
  paymentStatus: 'settled',
  stage: 'dns',
  messageCode: 'DNS_PROPAGATION_PENDING',
  startedAt,
  updatedAt: startedAt,
  completedAt: null,
  revision: 1,
  estimatedDurationSeconds: null,
  pollAfterSeconds: 5,
  completionEventId: null,
};

await mkdir('.qa/registration-notification', { recursive: true });
const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let sessionPayer = payer;
// Whether the account session is open (signing out ends it; disconnecting a wallet does not).
let signedIn = true;
let unavailable = false;
let throttled = false;
let agentReads = 0;
let extraRecords: RegistrationRecordFixture[] = [];
type NoticeChannel = 'popup' | 'dashboard';
const NOTICE_CHANNELS: NoticeChannel[] = ['popup', 'dashboard'];
const dismissedNotices = new Set<string>();
// The backend keeps one durable notice per channel for each registration of the payer whose
// payment settled or still needs confirmation (discovery issues it); uncharged attempts get none.
function noticesFor(channel: NoticeChannel) {
  return [record, ...extraRecords]
    .filter((item) => item.paymentStatus === 'settled' || item.paymentStatus === 'unknown')
    .map((item) => ({
      noticeId: `registration:${item.registrationId}`,
      source: 'registration',
      registrationId: item.registrationId,
      domain: item.domain,
      channel,
      createdAt: item.startedAt,
      expiresAt: new Date(
        Date.parse(item.startedAt) + (channel === 'popup' ? 5 : 10) * 86_400_000,
      ).toISOString(),
      status: 'registration',
      statusUrl: `${item.statusUrl}?expectedPayer=${sessionPayer}`,
    }))
    .filter((item) => !dismissedNotices.has(`${sessionPayer}:${channel}:${item.noticeId}`));
}
const statusReads: number[] = [];
const paidPosts: Array<string | null> = [];
await context.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin) {
    if (url.hostname === 'mainnet.base.org') {
      const input = request.postDataJSON() as JsonRpcRequest | JsonRpcRequest[];
      const result = (item: JsonRpcRequest) => ({ jsonrpc: '2.0', id: item.id, result: '0x0' });
      return route.fulfill({ json: Array.isArray(input) ? input.map(result) : result(input) });
    }
    return route.abort();
  }
  if (!url.pathname.startsWith('/api/v1/')) return route.continue();
  if (url.pathname === '/api/v1/auth/session')
    return route.fulfill({
      json: signedIn
        ? {
            authenticated: true,
            address: sessionPayer,
            chainId: 8453,
            account: {
              id: 'fixture-account',
              displayName: null,
              email: null,
              avatarUrl: null,
              onboarding: null,
            },
          }
        : { authenticated: false },
    });
  if (url.pathname === '/api/v1/agents/register') {
    paidPosts.push(request.postData());
    return route.fulfill({ status: 500, json: {} });
  }
  if (url.pathname.startsWith('/api/v1/registrations')) {
    assert.equal(
      url.searchParams.get('expectedPayer'),
      sessionPayer,
      'every status read needs its epoch payer condition',
    );
    statusReads.push(Date.now());
    if (throttled)
      return route.fulfill({ status: 429, headers: { 'Retry-After': '10' }, json: {} });
    if (unavailable)
      return route.fulfill({ status: 503, json: { message: 'PRIVATE_PROVIDER_ERROR' } });
    return route.fulfill({
      headers: { 'X-Authenticated-Wallet': sessionPayer },
      json:
        url.pathname === '/api/v1/registrations'
          ? { items: [record, ...extraRecords], total: 1 + extraRecords.length, hasMore: false }
          : [record, ...extraRecords].find((item) => item.statusUrl === url.pathname),
    });
  }
  if (url.pathname.startsWith('/api/v1/registration-notices')) {
    assert.equal(url.searchParams.get('expectedPayer'), sessionPayer);
    const headers = { 'X-Authenticated-Wallet': sessionPayer };
    if (unavailable)
      return route.fulfill({ status: 503, headers, json: { message: 'PRIVATE_PROVIDER_ERROR' } });
    if (request.method() === 'GET') {
      const channel = url.searchParams.get('channel') as NoticeChannel;
      return route.fulfill({ headers, json: { items: noticesFor(channel), nextCursor: null } });
    }
    if (request.method() === 'DELETE') {
      const id = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      dismissedNotices.add(`${sessionPayer}:${url.searchParams.get('channel')}:${id}`);
      return route.fulfill({ status: 204, headers, body: '' });
    }
    // Linking a local attempt to its registration returns that registration's notices.
    const body = request.postDataJSON() as { registrationId?: string };
    const items = NOTICE_CHANNELS.flatMap((channel) =>
      noticesFor(channel).filter((item) => item.registrationId === body.registrationId),
    );
    return route.fulfill({ headers, json: { items } });
  }
  if (url.pathname.startsWith('/api/v1/agents/by-wallet/')) {
    agentReads++;
    return route.fulfill({ json: [] });
  }
  return route.fulfill({ status: 404, json: {} });
});
await context.addInitScript(
  ({ payer, attempt, origin }) => {
    if (window.location.origin !== origin) return;
    // The dashboard lists durable notices in a collapsed "Registration updates" disclosure; this
    // flow inspects the rows, so it opens the disclosure whenever it (re)appears.
    new MutationObserver(() => {
      document
        .querySelector<HTMLButtonElement>(
          'section[aria-label="Registration updates"] > button[aria-expanded="false"]',
        )
        ?.click();
    }).observe(document, { childList: true, subtree: true });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => window.syntheticVisibility ?? 'visible',
    });
    if (!localStorage.getItem('synthetic-fixture-seeded')) {
      localStorage.setItem(
        `opensignet:registration-attempt:${attempt.clientId}`,
        JSON.stringify(attempt),
      );
      localStorage.setItem('synthetic-fixture-seeded', 'true');
    }
    let account: string | null = payer;
    type Listener = (...args: unknown[]) => void;
    const handlers = new Map<string, Listener[]>();
    window.syntheticResolutionEvents = 0;
    window.addEventListener(
      'opensignet:registration-completed',
      () => window.syntheticResolutionEvents++,
    );
    window.syntheticWallet = {
      signatureRequests: 0,
      switchAccount(next) {
        account = next;
        for (const callback of handlers.get('accountsChanged') ?? []) callback(next ? [next] : []);
      },
    };
    Reflect.set(window, 'ethereum', {
      isMetaMask: true,
      on(event: string, callback: Listener) {
        handlers.set(event, [...(handlers.get(event) ?? []), callback]);
      },
      removeListener(event: string, callback: Listener) {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((item) => item !== callback),
        );
      },
      async request({ method }: { method: string }) {
        if (['eth_accounts', 'eth_requestAccounts'].includes(method))
          return account ? [account] : [];
        if (method === 'eth_chainId') return '0x2105';
        if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions')
          return [{ parentCapability: 'eth_accounts' }];
        if (method === 'wallet_switchEthereumChain') return null;
        if (method.includes('sign') || method.includes('sendTransaction')) {
          window.syntheticWallet.signatureRequests++;
          throw new Error('Unexpected payment/signature request');
        }
        return null;
      },
    });
  },
  { payer, attempt, origin },
);

const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.setDefaultTimeout(30_000);

try {
  await page.goto(`${origin}/dashboard`, { timeout: 120_000 });
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: 'Waiting for DNS propagation' })
    .waitFor();
  assert.equal(await page.locator('[data-registration-pending]').count(), 1);
  assert.match(
    await page.locator('[data-registration-notification]').innerText(),
    /Payment confirmed.*Current step: DNS setup/s,
  );
  assert.match(
    await page.locator('[data-registration-notification]').innerText(),
    /Elapsed.*no estimate available/s,
  );
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /Registration failed|PRIVATE_PROVIDER_ERROR|No agents yet/,
  );
  const desktopNotice = await boxOf(page.locator('[data-registration-notification]'));
  assert.ok(desktopNotice.width >= 288 && desktopNotice.width <= 384);
  assert.ok(desktopNotice.x > 1000 && desktopNotice.x + desktopNotice.width <= 1440);
  assert.equal(await page.locator('[data-registration-banner]').count(), 0);
  await page.screenshot({ path: '.qa/registration-notification/desktop.png', fullPage: true });

  for (const [stage, label] of [
    ['domain', 'Domain registration'],
    ['email', 'Email setup'],
    ['basename', 'Basename registration'],
    ['ens', 'ENS registration'],
  ]) {
    record.stage = stage;
    record.messageCode = 'REGISTRATION_RETRY_SCHEDULED';
    record.revision++;
    record.updatedAt = new Date().toISOString();
    record.estimatedDurationSeconds = 125;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page
      .locator('[data-registration-notification]')
      .getByText(`Current step: ${label}`)
      .waitFor();
    assert.match(
      await page.locator('[data-registration-notification]').innerText(),
      /Estimated setup: about 2m 5s\. Timing varies/,
    );
  }
  record.stage = 'dns';
  record.messageCode = 'DNS_PROPAGATION_PENDING';
  record.estimatedDurationSeconds = null;
  record.revision++;
  record.updatedAt = new Date().toISOString();

  await page.goto(`${origin}/privacy`);
  await page
    .locator('[data-registration-notification]')
    .filter({ hasText: 'Waiting for DNS propagation' })
    .waitFor();
  await page.reload();
  await page
    .locator('[data-registration-notification]')
    .filter({ hasText: 'Waiting for DNS propagation' })
    .waitFor();
  // An outage withdraws stale progress instead of guessing, and never reflects provider text.
  unavailable = true;
  await page.goto(`${origin}/dashboard`);
  await page
    .getByText('Registration updates are unavailable. Do not pay again.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('[data-registration-notification]').count(), 0);
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /Registration failed|PRIVATE_PROVIDER_ERROR/,
  );
  unavailable = false;
  await page.waitForTimeout(10_500);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByText('Waiting for DNS propagation', { exact: false }).first().waitFor();

  const secondTab = await context.newPage();
  await secondTab.goto(`${origin}/dashboard`);
  await secondTab.locator('[data-registration-pending]').waitFor();
  throttled = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await secondTab.evaluate(() => window.dispatchEvent(new Event('focus')));
  await secondTab
    .getByText('Registration updates are unavailable. Do not pay again.', { exact: true })
    .waitFor();
  const throttledReads = statusReads.length;
  await page.waitForTimeout(3000);
  assert.equal(statusReads.length, throttledReads, 'same-payer tabs must share429 cooldown');
  throttled = false;
  await secondTab.close();
  await page.waitForTimeout(8500);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByText('Waiting for DNS propagation', { exact: false }).first().waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/dashboard`);
  await page.locator('[data-registration-pending]').waitFor();
  await page.screenshot({ path: '.qa/registration-notification/mobile.png', fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.evaluate(() => window.scrollTo(0, 300));
  const notice = await boxOf(page.locator('[data-registration-notification]'));
  const nav = await boxOf(page.locator('.opensignet-sticky-header'));
  assert.ok(
    notice.y >= nav.y + nav.height && nav.y === 0,
    'side notification must not move or overlap sticky navigation',
  );
  assert.ok(notice.width <= 384 && notice.x >= 12 && notice.x + notice.width <= 378);

  const priorReads = statusReads.length;
  await page.evaluate((address) => window.syntheticWallet.switchAccount(address), other);
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[data-registration-notification]')
        ?.textContent.includes('synthetic-registration.test'),
  );
  await page.waitForTimeout(5500);
  assert.equal(statusReads.length, priorReads, 'payer mismatch must pause status reads');
  await page.evaluate((address) => window.syntheticWallet.switchAccount(address), payer);
  await page.locator('[data-registration-pending]').waitFor();
  record.status = 'action_required';
  record.updatedAt = new Date().toISOString();
  record.messageCode = 'REGISTRATION_REVIEW_REQUIRED';
  record.pollAfterSeconds = 30;
  record.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page
    .getByText('Registration needs review. Do not pay again.', { exact: true })
    .last()
    .waitFor();
  const reviewReads = statusReads.length;
  await page.waitForTimeout(6000);
  assert.equal(statusReads.length, reviewReads, 'action-required polling must respect 30 seconds');
  const priorAgentReads = agentReads;
  record.status = 'completed';
  record.agentId = 'synthetic-agent';
  record.stage = 'complete';
  record.messageCode = 'REGISTRATION_COMPLETED';
  record.revision++;
  record.completedAt = new Date().toISOString();
  record.updatedAt = record.completedAt;
  record.completionEventId = 'synthetic-complete';
  const refreshedAgents = page.waitForResponse((response) =>
    response.url().includes('/api/v1/agents/by-wallet/'),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText(`${attempt.domain} registration complete`, { exact: true }).waitFor();
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: attempt.domain })
    .filter({ hasText: 'Registration complete' })
    .waitFor();
  await refreshedAgents;
  assert.equal(
    agentReads,
    priorAgentReads + 1,
    'completion must refresh normal dashboard data exactly once',
  );
  const firstToast = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: `${attempt.domain} registration complete` });
  await firstToast.hover();
  await page.evaluate((address) => window.syntheticWallet.switchAccount(address), other);
  await firstToast.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'View identity', exact: true }).count(), 0);
  await page.evaluate((address) => window.syntheticWallet.switchAccount(address), payer);
  await page.reload();
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  await page.waitForTimeout(1500);
  assert.equal(
    await page.getByText(`${attempt.domain} registration complete`, { exact: true }).count(),
    0,
  );

  const awayStartedAt = new Date().toISOString();
  const awayAttempt = {
    wallet: payer,
    domain: 'completed-while-away.test',
    clientId: `${Date.parse(awayStartedAt)}-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
  };
  Object.assign(record, {
    registrationId: '00000000-0000-4000-8000-000000000002',
    statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000002',
    domain: awayAttempt.domain,
    agentId: null,
    status: 'processing',
    stage: 'email',
    messageCode: 'REGISTRATION_RETRY_SCHEDULED',
    startedAt: awayStartedAt,
    updatedAt: awayStartedAt,
    completedAt: null,
    completionEventId: null,
    revision: 1,
    pollAfterSeconds: 5,
  });
  await page.evaluate((saved) => {
    localStorage.setItem(
      `opensignet:registration-attempt:${saved.clientId}`,
      JSON.stringify(saved),
    );
    window.dispatchEvent(new Event('focus'));
  }, awayAttempt);
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: awayAttempt.domain })
    .waitFor();
  const awayResolutionBaseline = await page.evaluate(() => window.syntheticResolutionEvents);
  const awayAgentReadBaseline = agentReads;
  await page.evaluate(() => {
    window.syntheticVisibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  Object.assign(record, {
    agentId: 'synthetic-away-agent',
    status: 'completed',
    stage: 'complete',
    messageCode: 'REGISTRATION_COMPLETED',
    completedAt: new Date().toISOString(),
    completionEventId: 'synthetic-away-complete',
    revision: 2,
  });
  record.updatedAt = record.completedAt;
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: awayAttempt.domain })
    .filter({ hasText: 'Registration complete' })
    .waitFor();
  assert.equal(
    await page.getByText(`${awayAttempt.domain} registration complete`, { exact: true }).count(),
    0,
  );
  assert.deepEqual(
    await page.evaluate(
      ({ payer, clientId }) => ({
        acknowledged: localStorage.getItem(
          `opensignet:registration-completed:${payer}:00000000-0000-4000-8000-000000000002`,
        ),
        saved: localStorage.getItem(`opensignet:registration-attempt:${clientId}`) !== null,
      }),
      { payer, clientId: awayAttempt.clientId },
    ),
    { acknowledged: null, saved: true },
  );
  await page.waitForFunction(
    (baseline) => window.syntheticResolutionEvents === baseline + 1,
    awayResolutionBaseline,
  );
  await page.waitForTimeout(6500);
  assert.equal(
    await page.evaluate(() => window.syntheticResolutionEvents),
    awayResolutionBaseline + 1,
  );
  await page.evaluate(() => {
    window.syntheticVisibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByText(`${awayAttempt.domain} registration complete`, { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.syntheticResolutionEvents),
    awayResolutionBaseline + 1,
  );
  assert.equal(
    agentReads,
    awayAgentReadBaseline + 1,
    'hidden completion and visible return refresh dashboard data only once',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-sonner-toast][data-mounted="true"]').waitFor();
  await page.screenshot({
    path: '.qa/registration-notification/return-completed.png',
    fullPage: true,
    animations: 'disabled',
  });
  const awayToast = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: `${awayAttempt.domain} registration complete` });
  await awayToast.hover();
  await page.evaluate(() => window.syntheticWallet.switchAccount(null));
  await awayToast.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'View identity', exact: true }).count(), 0);
  await page.evaluate((address) => window.syntheticWallet.switchAccount(address), payer);
  await page.reload();
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  await page.waitForTimeout(1500);
  assert.equal(
    await page.getByText(`${awayAttempt.domain} registration complete`, { exact: true }).count(),
    0,
  );

  const noticeStartedAt = new Date(Date.now() - 125_000).toISOString();
  const noticeAttempt = {
    wallet: payer,
    domain: `${'long-registration-name-'.repeat(2)}fixture.test`,
    clientId: `${Date.parse(noticeStartedAt)}-cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
  };
  Object.assign(record, {
    registrationId: '00000000-0000-4000-8000-000000000003',
    statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000003',
    domain: noticeAttempt.domain,
    agentId: null,
    status: 'processing',
    paymentStatus: 'settled',
    stage: 'email',
    messageCode: 'EMAIL_VERIFICATION_PENDING',
    startedAt: noticeStartedAt,
    updatedAt: noticeStartedAt,
    completedAt: null,
    completionEventId: null,
    revision: 1,
    estimatedDurationSeconds: null,
    pollAfterSeconds: 5,
  });
  const noticeRecord = { ...record };
  const protectedState = await page.evaluate((saved) => {
    const attemptKey = `opensignet:registration-attempt:${saved.clientId}`;
    const reservationKey = `opensignet:registration-submission:${saved.wallet}:${saved.domain}`;
    const reservation = JSON.stringify({
      version: 1,
      ...saved,
      phase: 'possibly_paid',
      createdAt: Number(saved.clientId.split('-')[0]),
      submittedAt: Number(saved.clientId.split('-')[0]),
      reviewAfter: Number(saved.clientId.split('-')[0]) + 120_000,
    });
    localStorage.setItem(attemptKey, JSON.stringify(saved));
    localStorage.setItem(reservationKey, reservation);
    window.dispatchEvent(new Event('focus'));
    return { attemptKey, reservationKey, attempt: JSON.stringify(saved), reservation };
  }, noticeAttempt);
  await page
    .locator('[data-registration-notification]')
    .filter({ hasText: noticeAttempt.domain })
    .waitFor();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const narrowNotice = await boxOf(page.locator('[data-registration-notification]'));
  assert.ok(narrowNotice.x >= 12 && narrowNotice.x + narrowNotice.width <= 308);
  assert.ok(narrowNotice.y >= 64 && narrowNotice.y + narrowNotice.height <= 568);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const close = page.getByRole('button', {
    name: 'Dismiss registration notification',
    exact: true,
  });
  await close.focus();
  assert.equal(await close.evaluate((element) => element === document.activeElement), true);
  await page.screenshot({
    path: '.qa/registration-notification/narrow-mobile.png',
    fullPage: true,
  });
  const headingBeforeDismiss = await boxOf(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  );
  await close.press('Enter');
  await page.locator('[data-registration-notification]').waitFor({ state: 'hidden' });
  const headingAfterDismiss = await boxOf(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  );
  assert.equal(
    headingAfterDismiss.y,
    headingBeforeDismiss.y,
    'dismissal must not move page content',
  );
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: noticeAttempt.domain })
    .waitFor();
  await page.waitForTimeout(12_500);
  assert.equal(
    await page.locator('[data-registration-notification]').count(),
    0,
    'polls must not reopen dismissed presentation',
  );
  assert.deepEqual(
    await page.evaluate(
      ({ attemptKey, reservationKey }) => ({
        attempt: localStorage.getItem(attemptKey),
        reservation: localStorage.getItem(reservationKey),
      }),
      protectedState,
    ),
    { attempt: protectedState.attempt, reservation: protectedState.reservation },
  );
  await page.reload();
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: noticeAttempt.domain })
    .waitFor();
  assert.equal(
    await page.locator('[data-registration-notification]').count(),
    0,
    'remount must preserve dismissal',
  );

  sessionPayer = other;
  Object.assign(record, {
    registrationId: '00000000-0000-4000-8000-000000000004',
    statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000004',
  });
  await page.evaluate((address) => window.syntheticWallet.switchAccount(address), other);
  await page
    .locator('[data-registration-notification]')
    .filter({ hasText: noticeAttempt.domain })
    .waitFor();
  assert.equal(
    await page.locator('[data-registration-pending]').count(),
    1,
    'other payer sees only its own row',
  );
  await page
    .getByRole('button', { name: 'Dismiss registration notification', exact: true })
    .click();
  sessionPayer = payer;
  Object.assign(record, noticeRecord);
  await page.evaluate((address) => window.syntheticWallet.switchAccount(address), payer);
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: noticeAttempt.domain })
    .waitFor();
  assert.equal(
    await page.locator('[data-registration-notification]').count(),
    0,
    'returning payer keeps its own dismissal',
  );
  signedIn = false;
  await page.evaluate(() => window.syntheticWallet.switchAccount(null));
  await page.evaluate(() => window.dispatchEvent(new Event('opensignet:session-changed')));
  await page.getByRole('heading', { name: 'Sign in to your dashboard', exact: true }).waitFor();
  assert.equal(await page.locator('[data-registration-notification]').count(), 0);
  assert.equal(await page.locator('[data-registration-pending]').count(), 0);
  signedIn = true;
  await page.evaluate((address) => window.syntheticWallet.switchAccount(address), payer);
  await page.evaluate(() => window.dispatchEvent(new Event('opensignet:session-changed')));
  await page.locator('[data-registration-pending]').waitFor();
  Object.assign(record, {
    status: 'completed',
    stage: 'complete',
    agentId: 'notice-completed-agent',
    revision: 2,
    updatedAt: new Date().toISOString(),
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  // The payer dismissed this registration's popup notice, so completion is shown only in the
  // durable dashboard row; a dismissed popup never comes back as a completion toast.
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: noticeAttempt.domain })
    .filter({ hasText: 'Registration complete' })
    .waitFor();
  await page.waitForTimeout(1500);
  assert.equal(
    await page.getByText(`${noticeAttempt.domain} registration complete`, { exact: true }).count(),
    0,
    'a dismissed popup notice must not reappear as a completion toast',
  );
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), protectedState.reservationKey),
    protectedState.reservation,
  );

  Object.assign(record, {
    registrationId: '00000000-0000-4000-8000-000000000005',
    statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000005',
    domain: 'settled-legacy.test',
    agentId: 'legacy-agent',
    status: 'completed',
    paymentStatus: 'settled',
    stage: 'complete',
    messageCode: 'REGISTRATION_COMPLETED',
    startedAt: '2026-05-23T10:00:00.000Z',
    updatedAt: '2026-05-23T10:00:00.000Z',
    completedAt: null,
    completionEventId: null,
    revision: 0,
  });
  const completedHistoryRead = page.waitForResponse((response) =>
    response.url().includes('/api/v1/registrations?'),
  );
  await page.reload();
  await completedHistoryRead;
  assert.equal(await page.locator('[data-registration-notification]').count(), 0);
  assert.equal(await page.locator('[data-registration-pending]').count(), 0);
  Object.assign(record, {
    registrationId: '00000000-0000-4000-8000-000000000006',
    statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000006',
    domain: 'unknown-legacy.test',
    status: 'action_required',
    paymentStatus: 'unknown',
    stage: 'payment',
    messageCode: 'PAYMENT_CONFIRMATION_REQUIRED',
    // A legacy record shape (no completion fields) inside the current notice retention window.
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
  });
  await page.reload();
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: 'unknown-legacy.test' })
    .waitFor();
  // A payment that still needs confirmation is surfaced in the popup as well, so the payer is
  // told not to pay again.
  await page
    .locator('[data-registration-notification]')
    .filter({ hasText: 'unknown-legacy.test' })
    .waitFor();
  const unknownText = await page.locator('[data-registration-pending]').innerText();
  assert.match(unknownText, /Payment status unavailable/);
  assert.doesNotMatch(
    unknownText,
    /Elapsed|Payment confirmed|Payment pending|Payment confirmation pending|Current step/,
  );
  await page.screenshot({
    path: '.qa/registration-notification/unknown-legacy.png',
    fullPage: true,
  });
  Object.assign(record, {
    status: 'completed',
    paymentStatus: 'settled',
    stage: 'complete',
    messageCode: 'REGISTRATION_COMPLETED',
    completionEventId: 'legacy-unknown:completed',
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('unknown-legacy.test registration complete', { exact: true }).waitFor();
  // The durable dashboard notice stays and now reads as complete.
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: 'unknown-legacy.test' })
    .filter({ hasText: 'Registration complete' })
    .waitFor();
  // The popup notice for this registration updates in place rather than disappearing.
  await page
    .locator('[data-registration-notification]')
    .filter({ hasText: 'unknown-legacy.test' })
    .filter({ hasText: 'Registration complete' })
    .waitFor();
  Object.assign(record, {
    registrationId: '00000000-0000-4000-8000-000000000007',
    statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000007',
    domain: 'finalizing-legacy.test',
    agentId: 'legacy-finalizing-agent',
    status: 'processing',
    paymentStatus: 'settled',
    stage: 'finalizing',
    messageCode: 'REGISTRATION_PROCESSING',
    completionEventId: null,
  });
  await page.reload();
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: 'finalizing-legacy.test' })
    .waitFor();
  assert.match(
    await page.locator('[data-registration-pending]').innerText(),
    /Payment confirmed.*Current step: Final checks/s,
  );
  const legacyResolutionBaseline = await page.evaluate(() => window.syntheticResolutionEvents);
  Object.assign(record, {
    status: 'completed',
    stage: 'complete',
    messageCode: 'REGISTRATION_COMPLETED',
    completionEventId: 'legacy-finalizing:completed',
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('finalizing-legacy.test registration complete', { exact: true }).waitFor();
  // The durable dashboard notice stays and now reads as complete.
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: 'finalizing-legacy.test' })
    .filter({ hasText: 'Registration complete' })
    .waitFor();
  // The popup notice for this registration updates in place rather than disappearing.
  await page
    .locator('[data-registration-notification]')
    .filter({ hasText: 'finalizing-legacy.test' })
    .filter({ hasText: 'Registration complete' })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.syntheticResolutionEvents),
    legacyResolutionBaseline + 1,
  );
  Object.assign(record, {
    ...noticeRecord,
    registrationId: '00000000-0000-4000-8000-000000000008',
    statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000008',
    domain: 'first-registration.test',
  });
  extraRecords = [
    {
      ...record,
      registrationId: '00000000-0000-4000-8000-000000000009',
      statusUrl: '/api/v1/registrations/00000000-0000-4000-8000-000000000009',
      domain: 'second-registration.test',
      stage: 'dns',
      messageCode: 'DNS_PROPAGATION_PENDING',
    },
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page
    .locator('[data-registration-notification]')
    .getByText('Registration updates (2)', { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('[data-registration-notification]')
      .getByRole('combobox', { name: 'Select registration update' })
      .locator('option')
      .count(),
    2,
    'the compact notice lets the payer pick either registration',
  );
  assert.equal(await page.locator('[data-registration-pending]').count(), 2);
  assert.equal(
    await page.locator('[data-registration-notification]').count(),
    1,
    'multiple registrations share one compact notice',
  );
  await page.screenshot({ path: '.qa/registration-notification/two-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.qa/registration-notification/two-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const pairNotice = await boxOf(page.locator('[data-registration-notification]'));
  assert.ok(pairNotice.x >= 12 && pairNotice.x + pairNotice.width <= 378);
  // Each registration's popup notice is dismissed on its own; the dashboard keeps both rows.
  for (let remaining = 2; remaining > 0; remaining--) {
    await page
      .getByRole('button', { name: 'Dismiss registration notification', exact: true })
      .click();
    if (remaining > 1)
      await page
        .locator('[data-registration-notification]')
        .getByRole('combobox', { name: 'Select registration update' })
        .waitFor({ state: 'detached' });
  }
  await page.locator('[data-registration-notification]').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-registration-pending]').count(), 2);
  await page.reload();
  await page
    .locator('[data-registration-pending]')
    .filter({ hasText: 'second-registration.test' })
    .waitFor();
  assert.equal(
    await page.locator('[data-registration-notification]').count(),
    0,
    'dismissing both popup notices persists across remount',
  );
  await page.screenshot({ path: '.qa/registration-notification/two-dismissed-mobile.png' });
  assert.equal(await page.evaluate(() => window.syntheticWallet.signatureRequests), 0);
  assert.equal(paidPosts.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    'Browser checks passed: desktop/390px/320px, fixed notice without layout shift, keyboard dismissal across polls/remount/wallet switches, unchanged replay protection, settled/unknown legacy fixtures, per-registration popup dismissal, selected stages, timing, navigation, unavailable reads, payer isolation, one hidden-completion resolution and one visible-return toast. Zero signatures, paid POSTs or page errors.',
  );
} catch (error) {
  await page.screenshot({ path: '.qa/registration-notification/failure.png', fullPage: true });
  console.error(await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
