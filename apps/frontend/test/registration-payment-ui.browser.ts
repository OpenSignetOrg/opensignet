import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { browserLaunchOptions, loadChromium } from './support/playwright.ts';
import { bundleText, loadEsbuild } from './support/esbuild.ts';
import { compileApplicationCss } from './support/tailwind.ts';

const chromium = loadChromium();
const { build } = loadEsbuild();
const root = fileURLToPath(new URL('../', import.meta.url));
const screenshots = `${root}/.qa/registration-payment-ui`;

interface PaymentFixture {
  wallet: string;
  amount: string;
  signatures: number;
  paidPosts: number;
  attempts: Array<{ domain: string; clientId: string }>;
  requests: string[];
  sign(): void;
  respond(status: number, body: unknown): void;
  loseResponse(): void;
}
type FixtureWindow = typeof window & { fixture: PaymentFixture };

const boundaries: Record<string, string> = {
  wagmi: `
    export const useAccount = () => ({ address: (window as FixtureWindow).fixture.wallet, isConnected: true });
    export const useConfig = () => ({});
    export const useWalletClient = () => ({ data: { account: { address: (window as FixtureWindow).fixture.wallet } } });
  `,
  'wagmi/actions': `
    export const getAccount = () => ({ address: (window as FixtureWindow).fixture.wallet });
    export const getWalletClient = async () => ({ account: { address: (window as FixtureWindow).fixture.wallet } });
  `,
  '@opensignet/sdk': `
    export const createX402PaymentHeaders = async () => {
      (window as FixtureWindow).fixture.signatures++;
      return new Promise(resolve => { (window as FixtureWindow).fixture.sign = () => resolve({ 'PAYMENT-SIGNATURE': 'synthetic-only' }); });
    };
  `,
  '@/hooks/use-base-chain': `export const useBaseChainGuard = () => ({ effectiveChainId: 8453, isBaseChain: true, isSwitchingBase: false, ensureBaseChain: async () => true });`,
  '@/lib/base-chain': `
    export const BASE_MAINNET_CHAIN_ID = 8453;
    export class BaseChainRequiredError extends Error {}
    export const isBaseChainRequiredError = () => false;
    export const isBaseChainMismatchError = () => false;
    export const getBaseChainSwitchCopy = () => ({});
  `,
  '@/lib/transaction-errors': `export const getTransactionErrorCopy = () => ({ kind: 'error' });`,
  // The payer is already signed in here, so the sign-in control never renders.
  '@/components/wallet/header-account-button': `export function HeaderAccountButton() { return null; }`,
  '@/hooks/use-siwe': `export const useSiwe = () => ({ session: { authenticated: true, address: (window as FixtureWindow).fixture.wallet }, signIn: async () => true, loading: false });`,
  '@/hooks/use-usdc-balance': `export const useUsdcBalance = () => ({ balanceAtomic: 1000000000000n, balanceNumber: 1000000, balanceFormatted: '1000000', isLoading: false });`,
  '@/components/register/registration-tracker-provider': `
    export const useRegistrationSnapshot = () => ({ connection: 'ready' });
    export const useRegistrationTracker = () => (window as FixtureWindow).fixture.tracker;
  `,
  '@/components/wallet/connect-wallet-button': `export const ConnectWalletButton = () => null;`,
  'next/link': `import React from 'react'; export default function Link({children, ...props}) { return <a {...props}>{children}</a>; }`,
  sonner: `export const toast = { error() {}, info() {} };`,
};

const entry = `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { RegisterFlow } from './src/components/register/register-flow';
  const f = (window as FixtureWindow).fixture = {
    wallet: '0x' + '1'.repeat(40), amount: '1234567', signatures: 0, paidPosts: 0,
    attempts: [], acceptance: null, requests: [],
  };
  f.tracker = {
    refresh: async () => true, isReadyForPayer: () => true,
    hasPurchase: (_wallet, domain) => f.attempts.some(a => a.domain === domain),
    matches: () => undefined, getAcceptance: () => f.acceptance,
    remember: attempt => {
      f.attempts.push(attempt);
      localStorage.setItem('opensignet:registration-attempt:' + attempt.clientId, JSON.stringify(attempt));
    },
    accept: (_attempt, accepted) => { f.acceptance = accepted; },
  };
  window.fetch = async (url, options) => {
    f.requests.push(String(url));
    if (url === '/api/v1/auth/session') return Response.json({ authenticated: true, address: f.wallet }, { headers: { Date: new Date().toUTCString() } });
    if (String(url).startsWith('/api/v1/domains/availability?')) return Response.json({ domain: 'payment.xyz', available: true, basenameAvailable: true, ensAvailable: true });
    if (String(url).startsWith('/api/v1/agents/quote?')) return Response.json({
      domainCostUsdc: '1', basenameCostUsdc: '0', ensCostUsdc: '0',
      emailFeeUsdc: '0', totalUsdc: '1',
    });
    if (url !== '/api/v1/agents/register') throw new Error('Unexpected synthetic request: ' + url);
    if (new Headers(options?.headers).has('PAYMENT-SIGNATURE')) {
      f.paidPosts++;
      return new Promise((resolve, reject) => {
        f.respond = (status, body) => resolve(Response.json(body, { status }));
        f.loseResponse = () => reject(new Error('Synthetic network loss'));
      });
    }
    return Response.json({ accepts: [{ amount: f.amount, extra: { quoteExpiresAt: Math.floor(Date.now() / 1000) + 300 } }] }, { status: 402 });
  };
  createRoot(document.getElementById('root')).render(<RegisterFlow />);
`;

const bundle = await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: root },
  absWorkingDir: root,
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': '"development"',
    'process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY': '""',
  },
  plugins: [
    {
      name: 'synthetic-payment-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) => {
          const name =
            args.path === './registration-tracker-provider'
              ? '@/components/register/registration-tracker-provider'
              : args.path;
          if (name in boundaries) return { path: name, namespace: 'synthetic-payment' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'synthetic-payment' }, (args) => ({
          contents: boundaries[args.path],
          loader: 'tsx',
          resolveDir: root,
        }));
      },
    },
  ],
});
const css = await compileApplicationCss([
  'src/components/register/register-flow.tsx',
  'src/components/ui/*.tsx',
]);

const browser = await chromium.launch(browserLaunchOptions());
try {
  await mkdir(screenshots, { recursive: true });
  for (const outcome of [
    'rejected',
    'cleanup-blocked',
    'accepted',
    'unknown',
    'completed',
    'large-amount',
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const external: string[] = [];
    const errors: string[] = [];
    await context.route('**/*', (route) => {
      if (route.request().url() === 'https://synthetic-payment.test/')
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><body style="font-family:Arial,sans-serif"><main style="max-width:800px;margin:auto;padding:16px"><div id="root"></div></main></body></html>',
        });
      external.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('https://synthetic-payment.test/');
    assert.deepEqual(
      await page.evaluate(() => ({
        secure: isSecureContext,
        randomUUID: typeof crypto.randomUUID,
        locks: typeof navigator.locks?.request,
      })),
      { secure: true, randomUUID: 'function', locks: 'function' },
    );
    await page.clock.install();
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundleText(bundle) });
    if (outcome === 'large-amount')
      await page.evaluate(() => {
        (window as FixtureWindow).fixture.amount = (2n ** 256n - 1n).toString();
      });
    await page.locator('#register-agent-name').fill('payment.xyz');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const checkout = page.getByRole('button', { name: 'Register agent identity', exact: true });
    await checkout.waitFor();
    await checkout.click();
    const signing = page.getByRole('status').filter({ hasText: 'Sign payment of' });
    await signing.waitFor({ timeout: 5000 }).catch(async () => {
      throw new Error(
        `${outcome}: ${await page.locator('body').innerText()}\n${JSON.stringify(await page.evaluate(() => (window as FixtureWindow).fixture.requests))}\n${errors.join('\n')}`,
      );
    });
    if (outcome !== 'large-amount') assert.match(await signing.innerText(), /1\.234567 USDC/);
    assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.paidPosts), 0);
    assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.attempts.length), 0);
    await page.clock.fastForward(90_001);
    assert.equal(await page.getByText('Price check required', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Search again', exact: true }).count(), 0);
    assert.equal(await page.getByText('Payment total (USDC on Base)', { exact: true }).count(), 1);
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await signing.evaluate((element) => {
        const style = getComputedStyle(element);
        const text = element.lastElementChild?.getBoundingClientRect();
        if (!text) throw new Error('Signing status has no text element');
        const box = element.getBoundingClientRect();
        return {
          top: parseFloat(style.paddingTop),
          bottom: parseFloat(style.paddingBottom),
          fits: text.left >= box.left && text.right <= box.right && text.bottom <= box.bottom,
        };
      });
      assert.equal(layout.top, 12, `${outcome} ${width}: status top padding`);
      assert.equal(layout.bottom, 12, `${outcome} ${width}: status bottom padding`);
      assert.equal(layout.fits, true, `${outcome} ${width}: exact signing amount fits`);
      const amountLine = page
        .getByText('Payment total (USDC on Base)', { exact: true })
        .locator('..');
      assert.equal(
        await amountLine.evaluate((element) => element.scrollWidth <= element.clientWidth),
        true,
        `${outcome} ${width}: full payment amount fits`,
      );
      const balanceWarning = page.getByText(/^You need .* USDC but only have/);
      if (await balanceWarning.count())
        assert.equal(
          await balanceWarning.evaluate((element) => element.scrollWidth <= element.clientWidth),
          true,
          `${outcome} ${width}: balance warning fits`,
        );
      await signing.scrollIntoViewIfNeeded();
      assert.ok(
        (await page.screenshot({ path: `${screenshots}/${outcome}-signing-${width}.png` })).length >
          1000,
      );
    }
    await page.evaluate(() => (window as FixtureWindow).fixture.sign());
    await page.getByRole('status').filter({ hasText: 'Submitting signed payment' }).waitFor();
    await page
      .getByRole('status')
      .filter({ hasText: 'Submitting signed payment' })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/${outcome}-submitting.png` });
    await page.waitForFunction(() => (window as FixtureWindow).fixture.paidPosts === 1);
    assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.attempts.length), 0);
    assert.equal(
      await page.getByText('Payment settled. Registration is processing.', { exact: true }).count(),
      0,
    );
    if (outcome === 'unknown') {
      await page.evaluate(() => (window as FixtureWindow).fixture.loseResponse());
      await page
        .getByRole('status')
        .filter({ hasText: 'Submission outcome is unconfirmed' })
        .waitFor();
      assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.attempts.length), 1);
    } else if (outcome === 'accepted') {
      await page.evaluate(() =>
        (window as FixtureWindow).fixture.respond(202, {
          registrationId: 'registration',
          status: 'processing',
          statusUrl: '/api/v1/registrations/registration',
          domain: 'payment.xyz',
          paymentStatus: 'settled',
          pollAfterSeconds: 5,
        }),
      );
      await page
        .getByRole('status')
        .filter({ hasText: 'Payment settled. Registration is processing.' })
        .waitFor();
      assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.attempts.length), 1);
    } else if (outcome === 'completed') {
      await page.evaluate(() =>
        (window as FixtureWindow).fixture.respond(200, {
          registrationId: 'registration',
          agentId: 'agent',
          domain: 'payment.xyz',
          nftTokenId: 1,
          basename: null,
          ensName: null,
          txHash: '0x' + 'a'.repeat(64),
          estimatedReadyAt: new Date().toISOString(),
          metadataUri: 'ipfs://synthetic',
          provisioningStatus: 'completed',
        }),
      );
      await page.getByRole('heading', { name: 'Identity registered!' }).waitFor();
      assert.equal(
        await page.getByRole('link', { name: 'Manage renewal' }).getAttribute('href'),
        '/agents/agent',
      );
    } else {
      if (outcome === 'cleanup-blocked')
        await page.evaluate(() => {
          const remove = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function (key) {
            if (key.startsWith('opensignet:registration-submission:'))
              throw new Error('Synthetic cleanup failure');
            return remove.call(this, key);
          };
        });
      await page.evaluate(() =>
        (window as FixtureWindow).fixture.respond(402, {
          paymentSubmission: { status: 'rejected', settlementAttempted: false },
          code: 'PAYMENT_QUOTE_EXPIRED',
          message: 'The payment quote expired.',
        }),
      );
      await page
        .getByText(
          outcome === 'cleanup-blocked' ? 'Purchase needs review' : 'Payment submission rejected',
          { exact: true },
        )
        .first()
        .waitFor();
      assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.attempts.length), 0);
      assert.equal(
        await page.evaluate(
          () =>
            Object.keys(localStorage).filter((key) =>
              key.startsWith('opensignet:registration-submission:'),
            ).length,
        ),
        outcome === 'cleanup-blocked' ? 1 : 0,
      );
      assert.equal(
        await page.getByText('This purchase is being tracked.', { exact: false }).count(),
        0,
      );
      if (outcome === 'cleanup-blocked') {
        assert.equal(
          await page
            .getByRole('button', { name: 'Purchase needs review', exact: true })
            .isDisabled(),
          true,
        );
        assert.equal(
          await page.getByText('Submission outcome is unconfirmed.', { exact: false }).count(),
          0,
        );
      } else assert.equal(await page.getByText('Price check required', { exact: true }).count(), 1);
    }
    assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.signatures), 1);
    assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.paidPosts), 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await page.screenshot({ path: `${screenshots}/${outcome}-outcome.png` });
    await context.close();
  }
  console.log(
    'PASS: real hook/UI with synthetic boundaries; exact amounts, expired search quote, signing/submitting/settled/unknown/rejected/completed, local status padding at four widths, no retries or live providers.',
  );
} finally {
  await browser.close();
}
