/**
 * Agent onboarding content: one context prompt that teaches any agent what OpenSignet is, and a
 * per-client connection prompt that lets the agent add the published OpenSignet MCP server
 * (`@opensignet/mcp-server`, local stdio) itself, with manual app steps as a fallback.
 */
export const MCP_PACKAGE = '@opensignet/mcp-server';
export const MCP_VERSION = '0.1.0';
export const MCP_PACKAGE_SPEC = `${MCP_PACKAGE}@${MCP_VERSION}`;
export const MCP_SERVER_NAME = 'opensignet';
export const MCP_API_URL = 'https://api.opensignet.com/api/v1';
export const MCP_DOCS_URL = 'https://docs.opensignet.com/sdk/mcp/';

export type OnboardingAgentId = 'claude' | 'chatgpt' | 'cursor' | 'opencode';

export interface ManualSetup {
  /** The app the steps are written for, e.g. "Claude desktop app". */
  app: string;
  steps: readonly string[];
  /** Configuration to paste, when the app reads a file. */
  config?: { label: string; code: string };
  note?: string;
}

export interface OnboardingAgent {
  id: OnboardingAgentId;
  name: string;
  /** Where to paste the prompts, e.g. "a new Claude chat". */
  pasteTarget: string;
  connectPrompt: string;
  manual: ManualSetup;
}

const npxArgs = ['-y', MCP_PACKAGE_SPEC];

const mcpServersJson = JSON.stringify(
  {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: 'npx',
        args: npxArgs,
        env: { OPENSIGNET_API_URL: MCP_API_URL },
      },
    },
  },
  null,
  2,
);

const openCodeJson = JSON.stringify(
  {
    $schema: 'https://opencode.ai/config.json',
    mcp: {
      [MCP_SERVER_NAME]: {
        type: 'local',
        command: ['npx', ...npxArgs],
        enabled: true,
        environment: { OPENSIGNET_API_URL: MCP_API_URL },
      },
    },
  },
  null,
  2,
);

const codexToml = [
  `[mcp_servers.${MCP_SERVER_NAME}]`,
  'command = "npx"',
  `args = [${npxArgs.map((arg) => JSON.stringify(arg)).join(', ')}]`,
  `env = { OPENSIGNET_API_URL = ${JSON.stringify(MCP_API_URL)} }`,
].join('\n');

/** The main prompt: everything an agent needs to understand and use OpenSignet well. */
export const CONTEXT_PROMPT = `You are going to help me with OpenSignet. Read this brief, keep it as working context, and use the links at the end whenever you need detail.

WHAT OPENSIGNET IS
OpenSignet is the agent-native identity and communications infrastructure. It gives an AI agent, or the person or team behind it, a complete internet identity in one flow, managed through a website, an HTTPS API, SDKs and an MCP server. It serves developers calling the API directly, people guiding agents, and permissioned autonomous workflows.

WHAT ONE REGISTRATION INCLUDES
- A real domain name (.xyz, .com, .ai, .org, .io, .net, .co or .app), searched with live availability and pricing.
- Managed DNS with programmable records, import and export.
- A professional email inbox on that domain, with aliases, sending, webhooks and usage limits by plan.
- An onchain AgentID: an ERC-721 identity on Base that proves who owns the identity.
- Optional onchain names: a Basename on Base and an ENS name on Ethereum.

HOW PAYMENT AND OWNERSHIP WORK
- Registration is paid in USDC on Base (x402 for software), and the exact total is shown before anything is signed. Plans can also be paid by card.
- The owner signs in with Google, a one-time email code or a wallet. One person has one account, and each account can create its own self-custodial OpenSignet wallet, locked with passkeys.
- Signing in never authorizes a payment; every payment is a separate approval.
- Renewals can run automatically from a renewal vault (the RenewalVault contract on Base) that the owner funds with USDC. If the vault runs short, the domain and its services can expire.
- Plans apply to the whole account and add email capacity, API keys, DNS records and aliases on top of what every registration includes. They are bought or changed from the pricing page or the dashboard (card or USDC on Base), never during registration.

WHY TEAMS CHOOSE IT
- One flow replaces a registrar, a DNS host, a mail provider and an onchain identity.
- Built for agents from the start: machine-readable docs, an MCP server, a TypeScript SDK, and plugins for Coinbase AgentKit, ElizaOS, LangChain, CrewAI and AutoGen.
- Self-custodial: identities and payments stay with the owner's wallet.

RULES YOU MUST FOLLOW
- Never ask for, store or repeat a private key, seed phrase or API key. Payment and signing happen in my wallet, not in this chat.
- Before any paid or irreversible action, tell me exactly what will happen and what it costs, and wait for my explicit approval.
- Prefer reading and checking (availability, quotes, records) before changing anything.
- If something is unavailable or unclear, say so plainly instead of guessing.

WHERE TO LEARN MORE
- Product overview: https://opensignet.com
- Documentation: https://docs.opensignet.com
- Documentation map for agents: https://docs.opensignet.com/llms.txt
- Site map for agents: https://opensignet.com/llms.txt
- API reference (base URL ${MCP_API_URL}): https://docs.opensignet.com/api-reference/overview/
- MCP server guide: ${MCP_DOCS_URL}
- Support: https://opensignet.com/support

Confirm in two or three sentences that you understand OpenSignet, then ask me what I want to do.`;

function connectPrompt(client: string, instructions: string): string {
  return `Connect yourself to OpenSignet through its MCP server so you can check domain availability, quote registrations and read my identities directly.

Server details
- Name: ${MCP_SERVER_NAME}
- Package: ${MCP_PACKAGE_SPEC} (runs locally with Node.js 20 or newer)
- Command: npx ${npxArgs.join(' ')}
- Environment: OPENSIGNET_API_URL=${MCP_API_URL}

How to add it in ${client}
${instructions}

Rules
- Keep the server read-only. Do not enable write tools, and never put keys or secrets in any configuration.
- If you cannot change your own settings, give me the exact steps instead, one at a time, and wait for me.
- When it is connected, list the OpenSignet tools you can see, then check whether my-agent.xyz is available and quote its price without registering, signing or paying for anything.

Setup guide: ${MCP_DOCS_URL}`;
}

export const ONBOARDING_AGENTS: readonly OnboardingAgent[] = [
  {
    id: 'claude',
    name: 'Claude',
    pasteTarget: 'a new Claude chat',
    connectPrompt: connectPrompt(
      'Claude',
      `- Claude desktop app: add the server below to claude_desktop_config.json (Settings > Developer > Edit Config), then fully quit and reopen Claude.
- Claude Code: run claude mcp add --transport stdio ${MCP_SERVER_NAME} --env OPENSIGNET_API_URL=${MCP_API_URL} -- npx ${npxArgs.join(' ')}

${mcpServersJson}`,
    ),
    manual: {
      app: 'Claude desktop app',
      steps: [
        'Open Settings, go to Developer and select Edit Config.',
        'Add the configuration below to claude_desktop_config.json and save it.',
        'Quit Claude completely and open it again. OpenSignet appears under Connectors.',
      ],
      config: { label: 'claude_desktop_config.json', code: mcpServersJson },
    },
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    pasteTarget: 'a new ChatGPT chat',
    connectPrompt: connectPrompt(
      'ChatGPT',
      `- ChatGPT desktop app: open Settings > MCP servers > Add server, choose STDIO, use the name, command, arguments and environment above, save, then restart.
- Codex (desktop app, IDE extension or terminal): the same server can be added to ~/.codex/config.toml:

${codexToml}`,
    ),
    manual: {
      app: 'ChatGPT desktop app',
      steps: [
        'Open Settings and go to MCP servers, then select Add server.',
        `Choose STDIO. Name it ${MCP_SERVER_NAME}, set the command to npx with the arguments ${npxArgs.join(' ')}, and add OPENSIGNET_API_URL=${MCP_API_URL}.`,
        'Save and restart when asked.',
      ],
      config: { label: '~/.codex/config.toml (same setup as a file)', code: codexToml },
      note: 'ChatGPT on the web connects only to hosted MCP servers, so use the desktop app for this local server.',
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    pasteTarget: 'a new Cursor agent chat',
    connectPrompt: connectPrompt(
      'Cursor',
      `- Add the server below to ~/.cursor/mcp.json for every project, or to .cursor/mcp.json in this project, then restart Cursor.

${mcpServersJson}`,
    ),
    manual: {
      app: 'Cursor',
      steps: [
        'Open ~/.cursor/mcp.json for every project, or .cursor/mcp.json in one project.',
        'Add the configuration below and save the file.',
        'Restart Cursor. OpenSignet appears in Customize > MCPs, where you can turn it on or off.',
      ],
      config: { label: 'mcp.json', code: mcpServersJson },
    },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    pasteTarget: 'a new OpenCode session',
    connectPrompt: connectPrompt(
      'OpenCode',
      `- Add the server below to opencode.json in this project, or to ~/.config/opencode/opencode.json for every project, then restart OpenCode.

${openCodeJson}`,
    ),
    manual: {
      app: 'OpenCode',
      steps: [
        'Open opencode.json in your project, or ~/.config/opencode/opencode.json for every project.',
        'Add the configuration below and save the file.',
        'Restart OpenCode so it loads the server.',
      ],
      config: { label: 'opencode.json', code: openCodeJson },
    },
  },
];
