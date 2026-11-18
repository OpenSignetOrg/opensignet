import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boxOf, browserLaunchOptions, loadChromium, type Page } from './support/playwright.ts';

// Usage: node test/agent-onboarding.browser.ts <playwright-core path> [production origin]
const chromium = loadChromium();
const origin = new URL(process.argv[3] ?? 'http://127.0.0.1:3108');
assert.equal(origin.hostname, '127.0.0.1', 'Browser regression tests are loopback-only');
const captures = resolve(fileURLToPath(new URL('../', import.meta.url)), '.qa/agent-onboarding');
await mkdir(captures, { recursive: true });

const TABS = ['Claude', 'ChatGPT', 'Cursor', 'OpenCode'] as const;

async function noHorizontalOverflow(page: Page, label: string): Promise<void> {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    `${label}: horizontal overflow`,
  );
}

const browser = await chromium.launch(browserLaunchOptions());
const errors: string[] = [];
try {
  for (const width of [320, 390, 768, 1440]) {
    const touch = width < 1024;
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: touch,
      isMobile: width < 768,
      reducedMotion: 'reduce',
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: origin.origin,
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${width}: ${error.message}`));
    await page.goto(new URL('/', origin).href, { waitUntil: 'networkidle' });

    const pill = page.getByRole('button', { name: /^Onboard your agent to OpenSignet/ });
    assert.equal(await pill.count(), 1, `${width}: one home pill`);
    const pillBox = await boxOf(pill);
    assert.ok(pillBox.height >= 36, `${width}: pill target height ${pillBox.height}`);
    assert.ok(pillBox.x >= 0 && pillBox.x + pillBox.width <= width, `${width}: pill fits`);
    assert.equal(
      await pill.locator('[data-agent-marks] svg').count(),
      4,
      `${width}: four agent marks`,
    );
    await noHorizontalOverflow(page, `${width} home`);
    await pill.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(captures, `pill-home-${width}.png`) });
    await pill.hover();
    await page.screenshot({
      path: resolve(captures, `pill-hover-${width}.png`),
      clip: { x: 0, y: Math.max(0, pillBox.y - 24), width, height: pillBox.height + 48 },
    });

    const scrollBefore = await page.evaluate(() => document.documentElement.clientWidth);
    if (touch) await pill.tap();
    else await pill.click();
    const dialog = page.getByRole('dialog', { name: 'Onboard your agent to OpenSignet' });
    await dialog.waitFor();
    // Measure the settled position, never a frame of the entrance animation.
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.clientWidth),
      scrollBefore,
      `${width}: opening the dialog must not shift the page`,
    );
    const dialogBox = await boxOf(dialog);
    assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= width + 0.5, `${width}: fits`);
    assert.ok(dialogBox.y + dialogBox.height <= 900.5, `${width}: within viewport height`);
    if (width < 640) assert.ok(Math.abs(dialogBox.y + dialogBox.height - 900) < 1.5, 'sheet');
    assert.equal(await page.getByRole('tab').count(), 4);
    assert.equal(
      await page.getByRole('tab', { name: 'Claude' }).getAttribute('aria-selected'),
      'true',
    );

    for (const [index, name] of TABS.entries()) {
      const tab = page.getByRole('tab', { name });
      if (index > 0) {
        await page.keyboard.press('ArrowRight');
        assert.equal(await tab.getAttribute('aria-selected'), 'true', `${width}: ${name}`);
        assert.equal(
          await tab.evaluate((element) => element === document.activeElement),
          true,
          `${width}: arrow keys move focus to ${name}`,
        );
      } else {
        await tab.focus();
      }
      const panel = page.getByRole('tabpanel');
      assert.ok((await panel.innerText()).length > 40, `${width}: ${name} panel content`);
      assert.equal(
        await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        true,
        `${width}: ${name} panel has no horizontal overflow`,
      );
      await dialog.screenshot({
        path: resolve(captures, `dialog-${name.toLowerCase()}-${width}.png`),
      });
    }
    await page.keyboard.press('Home');
    assert.equal(
      await page.getByRole('tab', { name: 'Claude' }).getAttribute('aria-selected'),
      'true',
    );

    // Step 1: the context prompt is the primary action and copies the full brief.
    const copy = dialog.getByRole('button', { name: 'Copy Context prompt', exact: true });
    await copy.click();
    await dialog.getByRole('button', { name: 'Context prompt copied', exact: true }).waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /^You are going to help me with OpenSignet\./);
    assert.match(
      copied,
      /OpenSignet is the agent-native identity and communications infrastructure\./,
    );
    assert.match(await page.getByRole('status').last().innerText(), /Copied to clipboard/);

    // The preview expands in place instead of scrolling inside the dialog.
    const expand = dialog.getByRole('button', { name: 'Show full prompt' }).first();
    assert.equal(await expand.getAttribute('aria-expanded'), 'false');
    await expand.click();
    await dialog.getByRole('button', { name: 'Show less' }).first().waitFor();
    await dialog.screenshot({ path: resolve(captures, `dialog-copied-${width}.png`) });

    // Step 2: the connection prompt and the manual app steps.
    await dialog.getByRole('button', { name: 'Copy Connection prompt', exact: true }).click();
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /^Connect yourself to OpenSignet through its MCP server/,
    );
    await dialog.getByText('Set it up yourself in Claude desktop app').click();
    const docs = dialog.getByRole('link', { name: /MCP setup guide/ });
    assert.equal(await docs.getAttribute('href'), 'https://docs.opensignet.com/sdk/mcp/');
    assert.equal(
      await dialog
        .getByRole('tabpanel')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      true,
      `${width}: expanded panel has no horizontal overflow`,
    );

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(
      await pill.evaluate((element) => element === document.activeElement),
      true,
      `${width}: focus returns to the pill`,
    );

    await page.goto(new URL('/support', origin).href, { waitUntil: 'networkidle' });
    const dashboardPill = page.getByRole('button', { name: /^Onboard your agent to OpenSignet/ });
    await dashboardPill.waitFor();
    await noHorizontalOverflow(page, `${width} support`);
    await page.screenshot({ path: resolve(captures, `pill-support-${width}.png`) });
    await dashboardPill.click();
    await page.getByRole('dialog', { name: 'Onboard your agent to OpenSignet' }).waitFor();
    await page.getByRole('button', { name: 'Close' }).click();
    await page
      .getByRole('dialog', { name: 'Onboard your agent to OpenSignet' })
      .waitFor({ state: 'hidden' });
    await context.close();
    console.log(`PASS onboarding pill and dialog at ${width}px (${touch ? 'touch' : 'mouse'})`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
console.log(`Screenshots: ${captures}`);
