import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const doc = (name: string): Promise<string> =>
  readFile(new URL(`../src/content/docs/sdk/${name}.mdx`, import.meta.url), 'utf8');

function markdownLinkTarget(source: string, label: string): string | undefined {
  const links = [...source.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].filter(
    ([, text]) => text === label,
  );
  assert.equal(links.length, 1, `Expected one Markdown link labeled ${label}`);
  return links[0]?.[2];
}

test('the source catalog records all eight workspace packages without claiming registry publication', async () => {
  const readme = await readFile(new URL('../../../README.md', import.meta.url), 'utf8');
  const { version } = JSON.parse(
    await readFile(new URL('../../../packages/shared/package.json', import.meta.url), 'utf8'),
  );
  const catalog = readme
    .replaceAll('\r\n', '\n')
    .split('## Public packages\n')[1]
    ?.split('\n## ')[0];
  assert.ok(typeof catalog === 'string');
  const rows = catalog.split('\n').filter((line) => /^\| \[/.test(line));
  assert.equal(rows.length, 8);
  assert.ok(catalog.includes(`The coordinated source version is **${version}**`));
  assert.match(catalog, /source version alone is\s+not publication evidence/);
  assert.doesNotMatch(catalog, /All eight packages are published at|\|\s*Published\b/i);
  assert.doesNotMatch(
    catalog,
    /Install the published SDK:/i,
    'The source catalog must not imply that its workspace version is already published',
  );
  for (const name of [
    'shared',
    'sdk',
    'mcp-server',
    'agentkit-plugin',
    'eliza-plugin',
    'langchain-plugin',
  ]) {
    const row = rows.find((line) => line.startsWith(`| [\`@opensignet/${name}\`](`));
    assert.ok(row, `${name}: missing npm catalog link`);
    assert.equal(
      markdownLinkTarget(row, `\`@opensignet/${name}\``),
      `https://www.npmjs.com/package/@opensignet/${name}`,
    );
    assert.match(row, /\| npm\s*\|/);
  }
  const crewai = rows.find((line) => line.startsWith('| [`opensignet-crewai`]('));
  assert.ok(crewai, 'Missing CrewAI catalog entry');
  assert.equal(
    markdownLinkTarget(crewai, '`opensignet-crewai`'),
    'https://pypi.org/project/opensignet-crewai/',
  );
  assert.match(crewai, /\| PyPI\s*\|/);
  const autogen = rows.find((line) => line.startsWith('| [`opensignet-autogen`]('));
  assert.ok(autogen, 'Missing AutoGen catalog entry');
  assert.equal(
    markdownLinkTarget(autogen, '`opensignet-autogen`'),
    'https://pypi.org/project/opensignet-autogen/',
  );
  assert.match(autogen, /\| PyPI\s*\|/);
  // Until the first release is published the catalog must say so, never imply availability.
  assert.match(catalog, /none of the packages has been\s+published yet/);
  assert.doesNotMatch(readme, /were published by|signed provenance were verified/);
  assert.match(
    readme,
    /do not invent REST endpoints for onchain functions,\s+authorize actions, or prove npm publication/,
  );
});

test('release history starts fresh in CHANGELOG.md and old release evidence is not carried over', async () => {
  await assert.rejects(readFile(new URL('../../../PREEXISTING.md', import.meta.url)), {
    code: 'ENOENT',
  });
  const changelog = await readFile(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');
  const { version } = JSON.parse(
    await readFile(new URL('../../../packages/shared/package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  assert.ok(changelog.includes(`## ${version} (unreleased)`));
  assert.match(changelog, /Nothing has been published to npm or PyPI yet/);
  const readme = await readFile(new URL('../../../README.md', import.meta.url), 'utf8');
  for (const source of [readme, changelog]) {
    assert.doesNotMatch(source, /releases\/tag\/|npm-v\d|GitHub Actions/);
  }
  assert.match(readme, /\[CHANGELOG\.md\]\(CHANGELOG\.md\)/);
  assert.match(readme, /OpenSignet is the agent-native identity and communications infrastructure/);
  assert.match(
    readme,
    /Built for developers, people working through agents, and autonomous workflows/,
  );
  assert.doesNotMatch(readme, /PREEXISTING\.md|ETHOnline|ETHGlobal|hackathon/i);
});

test('AI disclosure states human control without event-submission claims', async () => {
  const source = await readFile(new URL('../../../AI_DISCLOSURE.md', import.meta.url), 'utf8');
  assert.match(source, /agent-native identity and communications infrastructure/);
  assert.match(source, /OpenAI Codex and Anthropic Claude, have assisted its development/);
  assert.match(source, /not permission to sign a transaction, spend funds/);
  assert.match(source, /human approval callback/);
  assert.equal(markdownLinkTarget(source, 'CHANGELOG.md'), 'CHANGELOG.md');
  assert.doesNotMatch(source, /releases\/tag\/|commits? `[0-9a-f]{7,}`/);
  assert.doesNotMatch(source, /private operational plans|backend implementation/);
  assert.doesNotMatch(source, /ETHOnline|ETHGlobal|hackathon|submission|post-event|demo/i);
});

test('inspection docs pin 0.1.0, state it is unpublished and keep the source catalog separate', async () => {
  const sdk = await doc('typescript');
  const mcp = await doc('mcp');
  assert.match(sdk, /npm install @opensignet\/sdk@0\.1\.0 viem@2\.56\.3/);
  assert.match(mcp, /npm install --global @opensignet\/mcp-server@0\.1\.0/);
  for (const source of [sdk, mcp]) {
    assert.match(source, /Version 0\.1\.0 is not yet published to npm/);
    assert.match(source, /build from a source checkout/);
    assert.doesNotMatch(source, /is published on npm|release candidate|0\.9\.|0\.8\.x/);
    assert.doesNotMatch(source, /source-build target|new source-checkout (?:feature|export)/);
    assert.doesNotMatch(source, /independent-identity-inspection-source-checkout/);
  }
  assert.doesNotMatch(sdk, /catalog records workspace versions/);
  assert.doesNotMatch(mcp, /catalog remain source metadata/);
  assert.match(sdk, /pnpm --filter @opensignet\/sdk build/);
  assert.match(mcp, /node packages\/mcp-server\/dist\/index\.js/);
});

test('both interfaces document renewal from code within the owner approval', async () => {
  const sdk = await doc('typescript');
  const mcp = await doc('mcp');
  assert.match(sdk, /getRenewal\(agentId\)/);
  assert.match(sdk, /setAutoRenew\(agentId, false\)/);
  assert.match(mcp, /`get_renewal_status`/);
  assert.match(mcp, /`set_auto_renew`/);
  for (const source of [sdk, mcp]) {
    assert.match(source, /RENEWAL_APPROVAL_REQUIRED/);
    assert.match(source, /never widens what the wallet may pay/);
    assert.match(source, /30 to\s+7 days before/);
    for (const retired of [
      'inspectAgentRenewal',
      'prepareAutoRenewChange',
      'RenewalVault',
      'renewalVaultAddress',
      'builderCode',
      'inspect_agent_renewal',
      'fund_renewal_vault',
    ])
      assert.ok(!source.includes(retired), `retired surface still documented: ${retired}`);
  }
});

test('the renewal guide documents the API, the issue codes and the approval boundary', async () => {
  const source = await readFile(
    new URL('../src/content/docs/guides/renewal.mdx', import.meta.url),
    'utf8',
  );
  for (const route of [
    'GET /api/v1/agents/:id/renewal',
    'POST /api/v1/agents/:id/domain/auto-renew',
    'POST /api/v1/agents/:id/domain/auto-renew/off',
  ])
    assert.ok(source.includes(route), `missing ${route}`);
  for (const code of [
    'not_registered',
    'auto_renew_off',
    'price_unavailable',
    'approval_needed',
    'wallet_balance_low',
    'balance_unavailable',
    'card_missing',
  ])
    assert.ok(source.includes(`\`${code}\``), `missing issue code ${code}`);
  assert.match(source, /approves once, while signed in on opensignet\.com/);
  assert.match(source, /reminded 30, 7 and 1 day/);
  assert.match(source, /Code can\s+never widen what the wallet may pay/);
  assert.doesNotMatch(source, /RenewalVault|vault balance|builder code/i);
});

test('general AI disclosure retains assisted workflows without event or internal-role claims', async () => {
  const ai = await readFile(new URL('../../../AI_DISCLOSURE.md', import.meta.url), 'utf8');
  assert.match(ai, /Resumable registration, payment-state handling and recovery/);
  assert.match(ai, /Renewal status and the automatic-renewal switch for code/);
  assert.doesNotMatch(
    ai,
    /ETHOnline|ETHGlobal|hackathon|coordinating implementation|frontend owner|parent handles|\bFermat\b/i,
  );
});
