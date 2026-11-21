#!/usr/bin/env node
/**
 * OpenSignet MCP Server
 *
 * Exposes OpenSignet identity tools to any MCP-compatible LLM client
 * (Claude Desktop, ChatGPT desktop, custom agents, etc.).
 *
 * Stdio transport. Run via:
 *   opensignet-mcp
 * or in a client config:
 *   {
 *     "mcpServers": {
 *       "opensignet": {
 *         "command": "npx",
 *         "args": ["-y", "@opensignet/mcp-server"],
 *         "env": {
 *           "OPENSIGNET_API_URL": "https://api.opensignet.com/api/v1"
 *         }
 *       }
 *     }
 *   }
 *
 * Inject optional signing credentials through a trusted external secret source,
 * and only when a signing operation is explicitly enabled.
 */

import { readFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { OpenSignet } from '@opensignet/sdk';
import {
  DNS_RECORD_TYPES,
  dnsRecordSchema,
  dnsRecordObjectSchema,
  registrantSchema,
  type DnsRecordInput,
  type Registrant,
} from '@opensignet/shared';
import {
  OPENSIGNET_API_BASE_URL,
  SUPPORTED_FRAMEWORKS,
  SUPPORTED_TLDS,
} from '@opensignet/shared/constants';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

const API_URL = process.env.OPENSIGNET_API_URL ?? OPENSIGNET_API_BASE_URL;
const NETWORK = (process.env.OPENSIGNET_NETWORK ?? 'base') as 'base' | 'base-sepolia';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;

/**
 * The domain owner set once for this server (OPENSIGNET_REGISTRANT, as JSON), used when a
 * register call doesn't send one. Registries require it for every domain.
 */
function configuredRegistrant(): Registrant | undefined {
  const raw = process.env.OPENSIGNET_REGISTRANT;
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('OPENSIGNET_REGISTRANT must be JSON with the domain owner’s details.');
  }
  const result = registrantSchema.safeParse(parsed);
  if (!result.success)
    throw new Error(
      `OPENSIGNET_REGISTRANT is incomplete: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`,
    );
  return result.data;
}
const OPENSIGNET_API_KEY = process.env.OPENSIGNET_API_KEY;
const WRITE_TOOLS_ENV = 'OPENSIGNET_ENABLE_WRITE_TOOLS';
const WRITE_TOOLS_ENABLED = parseWriteToolsEnabled(process.env[WRITE_TOOLS_ENV]);
function getClient(): OpenSignet {
  const config: ConstructorParameters<typeof OpenSignet>[0] = {
    apiUrl: API_URL,
    apiKey: OPENSIGNET_API_KEY,
    network: NETWORK,
  };
  if (AGENT_PRIVATE_KEY) {
    const account = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
    const chain = NETWORK === 'base' ? base : baseSepolia;
    const rpc = NETWORK === 'base' ? 'https://mainnet.base.org' : 'https://sepolia.base.org';
    // Cast: viem's deeply-generic types do not always match cleanly across
    // duplicated installs in monorepos. Behaviour is identical at runtime.
    config.walletClient = createWalletClient({ account, chain, transport: http(rpc) }) as never;
  }
  return new OpenSignet(config);
}

const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const server = new Server(
  { name: 'opensignet-mcp', version: packageManifest.version },
  { capabilities: { tools: {} } },
);

// ----------------------------------------------------------------------
// TOOL DEFINITIONS
// ----------------------------------------------------------------------

const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'check_domain_availability',
    description:
      'Check whether a domain (name + tld) is available for registration. Returns availability status and pricing.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The desired label, e.g. "myagent"' },
        tld: {
          type: 'string',
          enum: SUPPORTED_TLDS,
          description: 'TLD',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'quote_registration',
    description:
      'Get a price quote for registering an agent identity bundle. Domain, DNS, email and the OpenSignet Pass are included by default. Basename and ENS are optional.',
    inputSchema: {
      type: 'object',
      properties: {
        preferredName: { type: 'string' },
        tld: { type: 'string', enum: SUPPORTED_TLDS },
        registerBasename: {
          type: 'boolean',
          description: 'Set true to also register a Basename on Base. Off by default.',
          default: false,
        },
        registerEns: {
          type: 'boolean',
          description: 'Set true to add ENS; false skips ENS cost.',
          default: false,
        },
        emailEnabled: {
          type: 'boolean',
          description: 'Deprecated compatibility flag. Email is now always included.',
          default: true,
        },
        emailUsername: {
          type: 'string',
          description: 'Primary email username. Defaults to hello, producing hello@domain.',
          default: 'hello',
        },
        years: { type: 'integer', default: 1, minimum: 1, maximum: 10 },
      },
      required: ['preferredName'],
    },
  },
  {
    name: 'register_agent_identity',
    description:
      'Register a complete agent identity bundle. Domain, DNS, email and the OpenSignet Pass are included by default. Basename and ENS are optional. Pays in USDC on Base. Requires AGENT_PRIVATE_KEY env var.',
    inputSchema: {
      type: 'object',
      properties: {
        preferredName: { type: 'string' },
        tld: { type: 'string', enum: SUPPORTED_TLDS },
        registerBasename: {
          type: 'boolean',
          description: 'Set true to also register a Basename on Base. Off by default.',
          default: false,
        },
        basenameLabel: { type: 'string', description: 'Optional alternate Basename label' },
        registerEns: {
          type: 'boolean',
          description: 'Set true to add ENS; false skips ENS cost.',
          default: false,
        },
        ensLabel: { type: 'string', description: 'Optional alternate ENS label' },
        ownerAddress: {
          type: 'string',
          description: 'Optional EVM address recorded as the identity owner',
        },
        emailEnabled: {
          type: 'boolean',
          description: 'Deprecated compatibility flag. Email is now always included.',
          default: true,
        },
        emailUsername: {
          type: 'string',
          description: 'Primary email username. Defaults to hello, producing hello@domain.',
          default: 'hello',
        },
        years: { type: 'integer', default: 1, minimum: 1, maximum: 10 },
        autoRenew: { type: 'boolean', default: true },
        registrant: {
          type: 'object',
          description:
            'The domain owner, which registries require for every domain. Optional when OPENSIGNET_REGISTRANT is set for this server. Kept out of public WHOIS wherever the registry allows it.',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            company: { type: 'string' },
            email: { type: 'string' },
            phoneCountryCode: { type: 'string', description: 'With the plus, for example +880' },
            phoneNumber: { type: 'string' },
            street: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postalCode: { type: 'string', description: 'Empty where the country has none' },
            country: { type: 'string', description: 'ISO 3166-1 alpha-2, for example BD' },
          },
          required: [
            'firstName',
            'lastName',
            'email',
            'phoneCountryCode',
            'phoneNumber',
            'street',
            'city',
            'postalCode',
            'country',
          ],
        },
        dnsTarget: { type: 'string', description: 'URL or IP to point the domain at' },
        metadata: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            capabilities: { type: 'array', items: { type: 'string' } },
            framework: { type: 'string', enum: SUPPORTED_FRAMEWORKS },
            x402Endpoint: { type: 'string' },
          },
        },
      },
      required: ['preferredName'],
    },
  },
  {
    name: 'lookup_agent',
    description: 'Look up agent identities by wallet address.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: '0x wallet address' },
      },
      required: ['wallet'],
    },
  },
  {
    name: 'get_agent',
    description:
      'Get one agent identity by OpenSignet agent ID. Works with an agent-scoped API key.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'send_agent_email',
    description:
      "Send an email from the identity's own domain, signed with its DKIM keys. Each recipient counts toward the monthly allowance. Pass the same idempotencyKey when retrying so the message is not sent twice.",
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
        to: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, maxItems: 50 }],
          description: 'One address or a list. To, cc and bcc together are at most 50.',
        },
        cc: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        bcc: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Delivered, but never shown in the message.',
        },
        replyTo: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        subject: { type: 'string' },
        text: { type: 'string', description: 'Plain-text body. Send text, html or both.' },
        html: { type: 'string', description: 'HTML body.' },
        fromAddress: {
          type: 'string',
          description: 'The primary address or an active alias; the primary when left out.',
        },
        fromName: {
          type: 'string',
          description: "Sender name; the identity's profile name when left out.",
        },
        attachments: {
          type: 'array',
          maxItems: 20,
          description: 'At most 20 files and 10 MB together. Programs and scripts are refused.',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              content: { type: 'string', description: 'The file in base64.' },
              contentType: { type: 'string' },
            },
            required: ['filename', 'content'],
          },
        },
        sendAt: {
          type: 'string',
          description: 'Send later: an ISO 8601 time up to 30 days ahead.',
        },
        idempotencyKey: {
          type: 'string',
          description:
            'A UUID kept with this send; the same key within 24 hours returns the first result.',
        },
      },
      required: ['agentId', 'to', 'subject'],
    },
  },
  {
    name: 'update_primary_email',
    description:
      'Change the primary email username for an agent. The old primary address stops receiving new mail.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
        username: { type: 'string', description: 'New primary local-part, e.g. agent or support' },
      },
      required: ['agentId', 'username'],
    },
  },
  {
    name: 'send_agent_email_batch',
    description:
      'Queue up to 100 emails in one request; each recipient counts toward monthly usage. strict (the default) sends nothing when any message is invalid; partial sends the valid ones and lists the others in errors.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        messages: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              to: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array', items: { type: 'string' }, maxItems: 50 },
                ],
                description: 'One address or a list. To, cc and bcc together are at most 50.',
              },
              cc: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
              bcc: {
                oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
                description: 'Delivered, but never shown in the message.',
              },
              replyTo: {
                oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
              },
              subject: { type: 'string' },
              text: { type: 'string', description: 'Plain-text body. Send text, html or both.' },
              html: { type: 'string', description: 'HTML body.' },
              fromAddress: {
                type: 'string',
                description: 'The primary address or an active alias; the primary when left out.',
              },
              fromName: {
                type: 'string',
                description: "Sender name; the identity's profile name when left out.",
              },
              attachments: {
                type: 'array',
                maxItems: 20,
                description:
                  'At most 20 files and 10 MB together. Programs and scripts are refused.',
                items: {
                  type: 'object',
                  properties: {
                    filename: { type: 'string' },
                    content: { type: 'string', description: 'The file in base64.' },
                    contentType: { type: 'string' },
                  },
                  required: ['filename', 'content'],
                },
              },
              sendAt: {
                type: 'string',
                description: 'Send later: an ISO 8601 time up to 30 days ahead.',
              },
            },
            required: ['to', 'subject'],
          },
        },
        validationMode: { type: 'string', enum: ['strict', 'partial'] },
        idempotencyKey: { type: 'string' },
      },
      required: ['agentId', 'messages'],
    },
  },
  {
    name: 'get_agent_email_usage',
    description: 'Get combined sent and received monthly quota usage and reset date.',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string' } },
      required: ['agentId'],
    },
  },
  {
    name: 'configure_email_webhook',
    description: 'Configure the signed email.received webhook for an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        url: { type: 'string' },
        payloadMode: { type: 'string', enum: ['metadata', 'inline_text'] },
        enabled: { type: 'boolean' },
      },
      required: ['agentId', 'url'],
    },
  },
  {
    name: 'create_email_alias',
    description: 'Create an extra receive-and-send email alias. Requires paid-plan alias capacity.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
        username: { type: 'string', description: 'Alias local-part, e.g. billing' },
      },
      required: ['agentId', 'username'],
    },
  },
  {
    name: 'delete_email_alias',
    description: 'Delete an active email alias from an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
        emailAddress: { type: 'string', description: 'Full alias address to delete' },
      },
      required: ['agentId', 'emailAddress'],
    },
  },
  {
    name: 'list_agent_email',
    description:
      'List received/sent text-only email messages for an email-enabled agent, including extracted verification codes.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
        limit: { type: 'number', default: 20 },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'delete_agent_email',
    description: 'Permanently delete one email message from an agent inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
        messageId: { type: 'string', description: 'Email message ID (UUID)' },
      },
      required: ['agentId', 'messageId'],
    },
  },
  {
    name: 'get_dns_capabilities',
    description:
      'Get the machine-readable DNS types, fields, limits, and safety warnings supported by OpenSignet.',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' } },
      required: ['agentId'],
    },
  },
  {
    name: 'list_dns_records',
    description: "List DNS records for an agent's domain.",
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'create_dns_record',
    description: 'Create a user-managed DNS record and apply the resulting DNS state.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        type: { type: 'string', enum: DNS_RECORD_TYPES },
        name: { type: 'string' },
        value: { type: 'string', description: 'Legacy format; structured data is preferred' },
        data: { type: 'object', description: 'Type-specific structured DNS record data' },
        ttl: { type: 'number', default: 3600 },
        priority: { type: 'number' },
      },
      required: ['agentId', 'type', 'name'],
    },
  },
  {
    name: 'update_dns_record',
    description: 'Update a user-managed DNS record and apply the resulting DNS state.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        recordId: { type: 'string' },
        type: { type: 'string', enum: DNS_RECORD_TYPES },
        name: { type: 'string' },
        value: { type: 'string' },
        data: { type: 'object', description: 'Type-specific structured DNS record data' },
        ttl: { type: 'number' },
        priority: { type: 'number' },
      },
      required: ['agentId', 'recordId'],
    },
  },
  {
    name: 'delete_dns_record',
    description: 'Delete a user-managed DNS record and apply the resulting DNS state.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        recordId: { type: 'string' },
      },
      required: ['agentId', 'recordId'],
    },
  },
  {
    name: 'change_dns_records',
    description:
      'Preview or apply an atomic DNS merge/replace batch. Apply requires the baseRevision returned by preview.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        records: { type: 'array', maxItems: 200, items: { type: 'object' } },
        mode: { type: 'string', enum: ['merge', 'replace'], default: 'merge' },
        dryRun: { type: 'boolean', default: true },
        baseRevision: { type: 'string', description: 'Required when dryRun is false' },
      },
      required: ['agentId', 'records'],
    },
  },
  {
    name: 'import_dns_zone',
    description: 'Preview or apply a BIND zone import. System-managed records remain protected.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        zoneFile: { type: 'string', description: 'BIND zone text, maximum 256 KiB' },
        mode: { type: 'string', enum: ['merge', 'replace'], default: 'merge' },
        dryRun: { type: 'boolean', default: true },
        baseRevision: { type: 'string', description: 'Required when dryRun is false' },
      },
      required: ['agentId', 'zoneFile'],
    },
  },
  {
    name: 'export_dns_zone',
    description:
      'Export user-managed or permitted complete DNS state as a standard BIND zone file.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        scope: { type: 'string', enum: ['user', 'all'], default: 'user' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'get_service_plan',
    description:
      'Get the limits one identity has from its account plan, and how the plan renews. Plans cover the whole account and are bought or changed by a person on opensignet.com, not through tools.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'get_renewal_status',
    description:
      'How the identity’s domain renews: whether automatic renewal is on, how it is paid (OpenSignet wallet or card), its yearly price in USDC atomic units, when it is charged (30 to 7 days before expiry), the wallet balance and approval, and the first thing in the way, if any.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'set_auto_renew',
    description:
      'Turn automatic renewal of the identity’s domain on or off. Renewals from the OpenSignet wallet need the owner’s approval once on opensignet.com; until then turning it on fails with RENEWAL_APPROVAL_REQUIRED. Turning it off means the domain expires unless renewed; the owner is still reminded before it does.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
        enabled: { type: 'boolean', description: 'true to renew automatically, false to stop' },
      },
      required: ['agentId', 'enabled'],
    },
  },
];

const READ_ONLY_TOOL_NAMES = new Set([
  'check_domain_availability',
  'quote_registration',
  'lookup_agent',
  'get_agent',
  'get_agent_email_usage',
  'list_agent_email',
  'get_dns_capabilities',
  'list_dns_records',
  'export_dns_zone',
  'get_service_plan',
  'get_renewal_status',
]);

const ADDITIVE_WRITE_TOOL_NAMES = new Set([
  'send_agent_email',
  'send_agent_email_batch',
  'create_email_alias',
  'create_dns_record',
]);

function annotationsForTool(name: string): ToolAnnotations {
  const readOnly = READ_ONLY_TOOL_NAMES.has(name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: readOnly ? false : !ADDITIVE_WRITE_TOOL_NAMES.has(name),
    idempotentHint: readOnly,
    openWorldHint: true,
  };
}

const addresses = z.union([z.string(), z.array(z.string()).max(50)]);
/** One message, as the send tools take it; the API checks every field again. */
const emailMessageSchema = z.object({
  to: addresses,
  cc: addresses.optional(),
  bcc: addresses.optional(),
  replyTo: addresses.optional(),
  subject: z.string(),
  text: z.string().optional(),
  html: z.string().optional(),
  fromAddress: z.string().email().optional(),
  fromName: z.string().max(100).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.string(),
        contentType: z.string().optional(),
      }),
    )
    .max(20)
    .optional(),
  sendAt: z.string().optional(),
});

const TOOLS: Tool[] = TOOL_DEFINITIONS.map((tool) => ({
  ...tool,
  annotations: annotationsForTool(tool.name),
}));
const ENABLED_TOOLS = WRITE_TOOLS_ENABLED
  ? TOOLS
  : TOOLS.filter((tool) => READ_ONLY_TOOL_NAMES.has(tool.name));
const ENABLED_TOOL_NAMES = new Set(ENABLED_TOOLS.map((tool) => tool.name));

// ----------------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ENABLED_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (!ENABLED_TOOL_NAMES.has(name)) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown or disabled tool: ${name}` }],
      };
    }

    const client = getClient();
    switch (name) {
      case 'check_domain_availability': {
        const a = z
          .object({ name: z.string(), tld: z.enum(SUPPORTED_TLDS).default('xyz') })
          .parse(args);
        const result = await client.checkAvailability(a.name, { tld: a.tld });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'quote_registration': {
        const a = z
          .object({
            preferredName: z.string(),
            tld: z.enum(SUPPORTED_TLDS).default('xyz'),
            registerBasename: z.boolean().default(false),
            registerEns: z.boolean().default(false),
            emailEnabled: z.boolean().default(true),
            emailUsername: z.string().optional(),
            years: z.number().int().min(1).max(10).default(1),
          })
          .parse(args);
        const result = await client.quote(a);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'register_agent_identity': {
        if (!AGENT_PRIVATE_KEY) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: "AGENT_PRIVATE_KEY env var is required for registration. Set it to your agent's wallet private key.",
              },
            ],
          };
        }
        const a = z
          .object({
            preferredName: z.string(),
            tld: z.enum(SUPPORTED_TLDS).default('xyz'),
            registerBasename: z.boolean().default(false),
            basenameLabel: z.string().optional(),
            registerEns: z.boolean().default(false),
            ensLabel: z.string().optional(),
            ownerAddress: z
              .string()
              .regex(/^0x[a-fA-F0-9]{40}$/)
              .optional(),
            emailEnabled: z.boolean().default(true),
            emailUsername: z.string().optional(),
            years: z.number().int().min(1).max(10).default(1),
            autoRenew: z.boolean().default(true),
            registrant: registrantSchema.optional(),
            dnsTarget: z.string().optional(),
            metadata: z.record(z.string(), z.any()).optional(),
          })
          .parse(args);
        const registrant = a.registrant ?? configuredRegistrant();
        const account = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
        const result = await client.register({
          ...a,
          ...(registrant ? { registrant } : {}),
          wallet: account.address,
          ownerAddress: a.ownerAddress as `0x${string}` | undefined,
          metadata: a.metadata as never,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'lookup_agent': {
        const a = z.object({ wallet: z.string() }).parse(args);
        const result = await client.getAgentsByWallet(a.wallet as `0x${string}`);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_agent': {
        const a = z.object({ agentId: z.string() }).parse(args);
        const result = await client.getAgentById(a.agentId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'send_agent_email': {
        const { agentId, idempotencyKey, ...message } = z
          .object({ agentId: z.string(), idempotencyKey: z.string().max(255).optional() })
          .merge(emailMessageSchema)
          .parse(args);
        const result = await client.sendEmail(agentId, { ...message, idempotencyKey });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_agent_email': {
        const a = z.object({ agentId: z.string(), limit: z.number().default(20) }).parse(args);
        const result = await client.listEmail(a.agentId, { limit: a.limit });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'delete_agent_email': {
        const a = z
          .object({ agentId: z.string().uuid(), messageId: z.string().uuid() })
          .parse(args);
        const result = await client.deleteEmailMessage(a.agentId, a.messageId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'send_agent_email_batch': {
        const a = z
          .object({
            agentId: z.string(),
            messages: z.array(emailMessageSchema).min(1).max(100),
            validationMode: z.enum(['strict', 'partial']).optional(),
            idempotencyKey: z.string().max(255).optional(),
          })
          .parse(args);
        const result = await client.sendEmailBatch(a.agentId, {
          messages: a.messages,
          validationMode: a.validationMode,
          idempotencyKey: a.idempotencyKey,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'get_agent_email_usage': {
        const a = z.object({ agentId: z.string() }).parse(args);
        const result = await client.getEmailUsage(a.agentId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'configure_email_webhook': {
        const a = z
          .object({
            agentId: z.string(),
            url: z.string().url(),
            payloadMode: z.enum(['metadata', 'inline_text']).default('metadata'),
            enabled: z.boolean().default(true),
          })
          .parse(args);
        const result = await client.setEmailWebhook(a.agentId, a);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'update_primary_email': {
        const a = z.object({ agentId: z.string(), username: z.string() }).parse(args);
        const result = await client.updatePrimaryEmail(a.agentId, a.username);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'create_email_alias': {
        const a = z.object({ agentId: z.string(), username: z.string() }).parse(args);
        const result = await client.createEmailAlias(a.agentId, a.username);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'delete_email_alias': {
        const a = z.object({ agentId: z.string(), emailAddress: z.string().email() }).parse(args);
        const result = await client.deleteEmailAlias(a.agentId, a.emailAddress);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_dns_capabilities': {
        const a = z.object({ agentId: z.string() }).parse(args);
        const result = await client.getDnsCapabilities(a.agentId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_dns_records': {
        const a = z.object({ agentId: z.string() }).parse(args);
        const result = await client.listDnsRecords(a.agentId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'create_dns_record': {
        const a = z
          .object({
            agentId: z.string(),
            type: z.enum(DNS_RECORD_TYPES),
            name: z.string(),
            value: z.string().optional(),
            data: z.record(z.string(), z.unknown()).optional(),
            ttl: z.number().default(3600),
            priority: z.number().optional(),
          })
          .parse(args);
        const { agentId, ...record } = a;
        const result = await client.createDnsRecord(
          agentId,
          dnsRecordSchema.parse(record) as DnsRecordInput,
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'update_dns_record': {
        const a = z
          .object({
            agentId: z.string(),
            recordId: z.string(),
            type: z.enum(DNS_RECORD_TYPES).optional(),
            name: z.string().optional(),
            value: z.string().optional(),
            data: z.record(z.string(), z.unknown()).optional(),
            ttl: z.number().optional(),
            priority: z.number().optional(),
          })
          .parse(args);
        const { agentId, recordId, ...record } = a;
        const result = await client.updateDnsRecord(
          agentId,
          recordId,
          dnsRecordObjectSchema.partial().parse(record) as Partial<DnsRecordInput>,
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'delete_dns_record': {
        const a = z.object({ agentId: z.string(), recordId: z.string() }).parse(args);
        const result = await client.deleteDnsRecord(a.agentId, a.recordId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'change_dns_records': {
        const a = z
          .object({
            agentId: z.string(),
            records: z.array(dnsRecordSchema).min(1).max(200),
            mode: z.enum(['merge', 'replace']).default('merge'),
            dryRun: z.boolean().default(true),
            baseRevision: z.string().length(64).optional(),
          })
          .parse(args);
        const result = a.dryRun
          ? await client.previewDnsBatch(a.agentId, a.records as DnsRecordInput[], a.mode)
          : await client.applyDnsBatch(
              a.agentId,
              a.records as DnsRecordInput[],
              requireDnsRevision(a.baseRevision),
              a.mode,
            );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'import_dns_zone': {
        const a = z
          .object({
            agentId: z.string(),
            zoneFile: z.string().min(1).max(262_144),
            mode: z.enum(['merge', 'replace']).default('merge'),
            dryRun: z.boolean().default(true),
            baseRevision: z.string().length(64).optional(),
          })
          .parse(args);
        const result = a.dryRun
          ? await client.previewDnsImport(a.agentId, a.zoneFile, a.mode)
          : await client.applyDnsImport(
              a.agentId,
              a.zoneFile,
              requireDnsRevision(a.baseRevision),
              a.mode,
            );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'export_dns_zone': {
        const a = z
          .object({ agentId: z.string(), scope: z.enum(['user', 'all']).default('user') })
          .parse(args);
        const result = await client.exportDnsZone(a.agentId, a.scope);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'get_service_plan': {
        const a = z.object({ agentId: z.string() }).parse(args);
        const result = await client.getServicePlan(a.agentId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'get_renewal_status': {
        const a = z.object({ agentId: z.string() }).parse(args);
        const result = await client.getRenewal(a.agentId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'set_auto_renew': {
        const a = z.object({ agentId: z.string(), enabled: z.boolean() }).strict().parse(args);
        const result = await client.setAutoRenew(a.agentId, a.enabled);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        };
    }
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
    };
  }
});

// ----------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------

function requireDnsRevision(value: string | undefined): string {
  if (!value) throw new Error('Apply requires baseRevision from a fresh DNS dry-run preview.');
  return value;
}

function parseWriteToolsEnabled(value: string | undefined): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error(`${WRITE_TOOLS_ENV} must be exactly "true" or "false" when set.`);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenSignet MCP server running on stdio');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
