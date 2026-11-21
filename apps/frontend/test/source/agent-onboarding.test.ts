import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CONTEXT_PROMPT,
  MCP_API_URL,
  MCP_DOCS_URL,
  MCP_PACKAGE,
  MCP_VERSION,
  ONBOARDING_AGENTS,
} from '../../src/lib/agent-onboarding';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const mcpManifest = JSON.parse(read('../../../../packages/mcp-server/package.json')) as {
  name: string;
  version: string;
};
const mcpSource = read('../../../../packages/mcp-server/src/index.ts');
const mcpReadme = read('../../../../packages/mcp-server/README.md');
const SECRET_NAMES = /AGENT_PRIVATE_KEY|OPENSIGNET_API_KEY|OPENSIGNET_ENABLE_WRITE_TOOLS/;

test('setup targets the published MCP package, version and documented API variable', () => {
  assert.equal(MCP_PACKAGE, mcpManifest.name);
  assert.equal(MCP_VERSION, mcpManifest.version);
  assert.match(mcpSource, /process\.env\.OPENSIGNET_API_URL/);
  assert.ok(mcpReadme.includes(`"OPENSIGNET_API_URL": "${MCP_API_URL}"`));
  assert.ok(mcpReadme.includes(`npx -y ${MCP_PACKAGE}@${MCP_VERSION}`));
  assert.equal(MCP_DOCS_URL, 'https://docs.opensignet.com/sdk/mcp/');
});

test('one tab per supported agent, in the order of the onboarding pill', () => {
  assert.deepEqual(
    ONBOARDING_AGENTS.map((agent) => agent.id),
    ['claude', 'chatgpt', 'cursor', 'opencode'],
  );
});

test('the context prompt explains the product, its safety rules and where to learn more', () => {
  assert.match(
    CONTEXT_PROMPT,
    /OpenSignet is the agent-native identity and communications infrastructure\./,
  );
  for (const topic of [
    /domain/i,
    /DNS/,
    /HTTPS API/,
    /email inbox/,
    /OpenSignet Pass/,
    /USDC on Base/,
    /x402/,
    /renew automatically/,
    /MCP server/,
  ])
    assert.match(CONTEXT_PROMPT, topic);
  assert.match(
    CONTEXT_PROMPT,
    /Never ask for, store or repeat a private key, seed phrase or API key/,
  );
  assert.match(CONTEXT_PROMPT, /wait for my explicit approval/);
  for (const url of [
    'https://docs.opensignet.com',
    'https://docs.opensignet.com/llms.txt',
    'https://opensignet.com/llms.txt',
    MCP_DOCS_URL,
  ])
    assert.ok(CONTEXT_PROMPT.includes(url), url);
  assert.doesNotMatch(CONTEXT_PROMPT, SECRET_NAMES);
});

test('every connection prompt and manual config is exact, read-only and free of credentials', () => {
  for (const agent of ONBOARDING_AGENTS) {
    assert.ok(agent.connectPrompt.includes(`${MCP_PACKAGE}@${MCP_VERSION}`), agent.id);
    assert.ok(agent.connectPrompt.includes(MCP_API_URL), agent.id);
    assert.match(agent.connectPrompt, /Keep the server read-only/, agent.id);
    assert.match(agent.connectPrompt, /without registering, signing or paying/, agent.id);
    assert.doesNotMatch(agent.connectPrompt, SECRET_NAMES, agent.id);
    assert.ok(agent.manual.steps.length >= 2, agent.id);
    const config = agent.manual.config?.code ?? '';
    assert.ok(config.includes(`${MCP_PACKAGE}@${MCP_VERSION}`), agent.id);
    assert.ok(config.includes(MCP_API_URL), agent.id);
    assert.doesNotMatch(config, SECRET_NAMES, agent.id);
    if (agent.id !== 'chatgpt') JSON.parse(config);
  }
  const byId = new Map(ONBOARDING_AGENTS.map((agent) => [agent.id, agent]));
  const openCode = JSON.parse(byId.get('opencode')?.manual.config?.code ?? '{}') as {
    mcp: { opensignet: { type: string; command: string[]; environment: Record<string, string> } };
  };
  assert.equal(openCode.mcp.opensignet.type, 'local');
  assert.deepEqual(openCode.mcp.opensignet.command, ['npx', '-y', `${MCP_PACKAGE}@${MCP_VERSION}`]);
  assert.match(byId.get('chatgpt')?.manual.config?.code ?? '', /^\[mcp_servers\.opensignet\]$/m);
  assert.ok(
    byId.get('claude')?.connectPrompt.includes('claude mcp add --transport stdio opensignet'),
  );
});

test('the connection check uses only tools the default read-only server advertises', () => {
  for (const tool of ['check_domain_availability', 'quote_registration']) {
    assert.match(mcpSource, new RegExp(`name: '${tool}'`));
  }
});

test('ChatGPT is described accurately: a local stdio server in the desktop app, not the web', () => {
  const chatgpt = ONBOARDING_AGENTS.find((agent) => agent.id === 'chatgpt');
  assert.equal(chatgpt?.manual.app, 'ChatGPT desktop app');
  assert.ok(
    chatgpt?.manual.note?.includes('ChatGPT on the web connects only to hosted MCP servers'),
  );
  assert.doesNotMatch(mcpSource, /StreamableHTTPServerTransport|SSEServerTransport/);
});

test('dialog keeps accessible tab, dialog and live-region semantics', () => {
  const source = read('../../src/components/onboarding/agent-onboarding.tsx');
  for (const pattern of [
    /role="tablist"/,
    /role="tab"/,
    /role="tabpanel"/,
    /aria-selected=\{selected\}/,
    /aria-labelledby=\{titleId\}/,
    /aria-haspopup="dialog"/,
    /aria-live="polite"/,
    /aria-expanded=\{expanded\}/,
    /showModal\(\)/,
    /ArrowRight|ArrowLeft/,
  ])
    assert.match(source, pattern);
  const marks = read('../../src/components/onboarding/agent-marks.tsx');
  assert.match(marks, /Simple Icons 15\.22\.0/);
  assert.match(marks, /opencode\.ai\/favicon\.svg/);
  assert.doesNotMatch(marks, /https?:\/\/[^\s'"]+\.svg['"]/);
});
