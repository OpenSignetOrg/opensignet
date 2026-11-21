// AgentKit and its framework extensions still consume zod 3 schemas, so action schemas use
// the zod 3 API shipped inside the patched zod 4 package. Shared zod 4 schemas validate
// the records again before any request is sent.
import { z } from 'zod/v3';
import { OpenSignet } from '@opensignet/sdk';
import {
  DNS_RECORD_TYPES,
  dnsRecordSchema,
  registrantSchema,
  type DnsRecordInput,
  type Registrant,
} from '@opensignet/shared';
import { OPENSIGNET_API_BASE_URL, SUPPORTED_TLDS } from '@opensignet/shared/constants';
import { createWalletClient, http, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const RegisterSchema = z.object({
  preferredName: z.string().min(3).max(63),
  tld: z.enum(SUPPORTED_TLDS).default('xyz'),
  registerBasename: z.boolean().default(false),
  basenameLabel: z.string().min(3).max(63).optional(),
  registerEns: z.boolean().default(false),
  ensLabel: z.string().min(3).max(63).optional(),
  ownerAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  emailEnabled: z.boolean().default(true),
  emailUsername: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/)
    .optional(),
  dnsTarget: z.string().url().optional(),
  years: z.number().int().min(1).max(10).default(1),
  autoRenew: z.boolean().default(true),
  /** The domain owner; defaults to the provider's `registrant` option. */
  registrant: z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      company: z.string().optional(),
      email: z.string(),
      phoneCountryCode: z.string(),
      phoneNumber: z.string(),
      street: z.string(),
      city: z.string(),
      state: z.string().optional(),
      postalCode: z.string(),
      country: z.string(),
    })
    .strict()
    .optional(),
});

const QuoteSchema = z.object({
  preferredName: z.string(),
  tld: z.enum(SUPPORTED_TLDS).default('xyz'),
  registerBasename: z.boolean().default(false),
  basenameLabel: z.string().min(3).max(63).optional(),
  registerEns: z.boolean().default(false),
  ensLabel: z.string().min(3).max(63).optional(),
  emailEnabled: z.boolean().default(true),
  emailUsername: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/)
    .optional(),
  years: z.number().int().min(1).max(10).default(1),
});

const Addresses = z.union([z.string().email(), z.array(z.string().email()).min(1).max(50)]);
const SendEmailSchema = z.object({
  agentId: z.string(),
  to: Addresses,
  cc: Addresses.optional(),
  bcc: Addresses.optional().describe('Delivered, but never shown in the message.'),
  replyTo: Addresses.optional(),
  subject: z.string().min(1).max(998),
  text: z.string().max(2_000_000).optional().describe('Plain-text body. Send text, html or both.'),
  html: z.string().max(2_000_000).optional(),
  fromAddress: z
    .string()
    .email()
    .optional()
    .describe('The primary address or an active alias; the primary when left out.'),
  fromName: z.string().max(100).optional(),
  sendAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe('Send later: an ISO 8601 time up to 30 days ahead.'),
  idempotencyKey: z
    .string()
    .max(255)
    .optional()
    .describe('A UUID kept with this send; the same key within 24 hours returns the first result.'),
});

const ListEmailSchema = z.object({
  agentId: z.string(),
  limit: z.number().int().min(1).max(100).default(20),
});
const DeleteEmailMessageSchema = z.object({
  agentId: z.string().uuid(),
  messageId: z.string().uuid(),
});
const BatchEmailSchema = z.object({
  agentId: z.string(),
  messages: z
    .array(SendEmailSchema.omit({ agentId: true, idempotencyKey: true }))
    .min(1)
    .max(100),
  validationMode: z.enum(['strict', 'partial']).optional(),
  idempotencyKey: z.string().max(255).optional(),
});
const EmailUsageSchema = z.object({ agentId: z.string() });
const EmailWebhookSchema = z.object({
  agentId: z.string(),
  url: z.string().url(),
  payloadMode: z.enum(['metadata', 'inline_text']).default('metadata'),
  enabled: z.boolean().default(true),
});

const RenewalStatusSchema = z.object({
  agentId: z.string().min(1),
});

const SetAutoRenewSchema = z.object({
  agentId: z.string().min(1),
  enabled: z.boolean(),
});

const DnsRecordTypeSchema = z.enum(DNS_RECORD_TYPES);

const ListDnsSchema = z.object({
  agentId: z.string().min(1),
});

const CreateDnsSchema = z
  .object({
    agentId: z.string().min(1),
    type: DnsRecordTypeSchema,
    name: z.string().min(1).max(253),
    value: z.string().min(1).max(65_535).optional(),
    data: z.record(z.unknown()).optional(),
    ttl: z.number().int().min(60).max(3600).default(3600),
    priority: z.number().int().min(0).max(65_535).optional(),
  })
  .refine((record) => record.value !== undefined || record.data !== undefined, {
    message: 'Provide structured data or the legacy value field',
    path: ['data'],
  });

const UpdateDnsSchema = z.object({
  agentId: z.string().min(1),
  recordId: z.string().min(1),
  type: DnsRecordTypeSchema.optional(),
  name: z.string().min(1).max(253).optional(),
  value: z.string().min(1).max(65_535).optional(),
  data: z.record(z.unknown()).optional(),
  ttl: z.number().int().min(60).max(3600).optional(),
  priority: z.number().int().min(0).max(65_535).optional(),
});

const DeleteDnsSchema = z.object({
  agentId: z.string().min(1),
  recordId: z.string().min(1),
});

const DnsBatchRecordSchema = z
  .object({
    type: DnsRecordTypeSchema,
    name: z.string().min(1).max(253),
    value: z.string().min(1).max(65_535).optional(),
    data: z.record(z.unknown()).optional(),
    ttl: z.number().int().min(60).max(3600).optional(),
    priority: z.number().int().min(0).max(65_535).nullable().optional(),
  })
  .refine((record) => record.value !== undefined || record.data !== undefined, {
    message: 'Provide structured data or the legacy value field',
    path: ['data'],
  });

const ChangeDnsSchema = z.object({
  agentId: z.string().min(1),
  records: z.array(DnsBatchRecordSchema).min(1).max(200),
  mode: z.enum(['merge', 'replace']).default('merge'),
  dryRun: z.boolean().default(true),
  baseRevision: z.string().length(64).optional(),
});

const ImportDnsSchema = z.object({
  agentId: z.string().min(1),
  zoneFile: z.string().min(1).max(262_144),
  mode: z.enum(['merge', 'replace']).default('merge'),
  dryRun: z.boolean().default(true),
  baseRevision: z.string().length(64).optional(),
});

const ExportDnsSchema = z.object({
  agentId: z.string().min(1),
  scope: z.enum(['user', 'all']).default('user'),
});

const ServicePlanStatusSchema = z.object({
  agentId: z.string().min(1),
});

const UpdatePrimaryEmailSchema = z.object({
  agentId: z.string().min(1),
  idempotencyKey: z.string().uuid().optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/),
});

const CreateEmailAliasSchema = UpdatePrimaryEmailSchema;

const DeleteEmailAliasSchema = z.object({
  agentId: z.string().min(1),
  idempotencyKey: z.string().uuid().optional(),
  emailAddress: z.string().email(),
});

interface WalletProvider {
  getAddress(): string;
  signTypedData?: (data: unknown) => Promise<string>;
  signMessage?: (message: string) => Promise<string>;
  sendTransaction?: (tx: unknown) => Promise<string>;
}

export interface OpenSignetActionProviderOptions {
  apiUrl?: string;
  apiKey?: string;
  baseRpcUrl?: string;
  network?: 'base' | 'base-sepolia';
  /** The domain owner for registrations, which registries require for every domain. */
  registrant?: Registrant;
}

export class OpenSignetActionProvider {
  public readonly name = 'opensignet';

  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly baseRpcUrl: string;
  private readonly network: 'base' | 'base-sepolia';
  private readonly registrant?: Registrant;

  constructor(opts: OpenSignetActionProviderOptions = {}) {
    this.apiUrl = opts.apiUrl ?? OPENSIGNET_API_BASE_URL;
    this.apiKey = opts.apiKey;
    this.baseRpcUrl = opts.baseRpcUrl ?? 'https://mainnet.base.org';
    this.network = opts.network ?? 'base';
    this.registrant = opts.registrant ? registrantSchema.parse(opts.registrant) : undefined;
  }

  private createOpenSignet(walletProvider: WalletProvider) {
    const wallet = walletProvider.getAddress() as Address;
    const chain = this.network === 'base-sepolia' ? baseSepolia : base;

    const walletClient = createWalletClient({
      chain,
      transport: http(this.baseRpcUrl),
      account: {
        address: wallet,
        signTypedData: walletProvider.signTypedData as
          ((parameters: any) => Promise<string>) | undefined,
        signMessage: walletProvider.signMessage
          ? (parameters: { message: string }) => walletProvider.signMessage!(parameters.message)
          : undefined,
      } as never,
    });

    const ad = new OpenSignet({
      apiUrl: this.apiUrl,
      apiKey: this.apiKey,
      network: this.network,
      walletClient: walletClient as never,
    });

    return { ad, wallet, walletClient, chain };
  }

  getActions() {
    return [
      {
        name: 'register_agent_identity',
        description:
          'Register a complete agent identity bundle on OpenSignet. Domain, DNS, email setup and the OpenSignet Pass are included by default. Basename and ENS are optional paid add-ons. Pays in USDC on Base.',
        schema: RegisterSchema,
        invoke: this.register.bind(this),
      },
      {
        name: 'quote_agent_registration',
        description:
          'Price an agent identity registration before committing. Email setup and the OpenSignet Pass are included; Basename and ENS only charge when enabled.',
        schema: QuoteSchema,
        invoke: this.quote.bind(this),
      },
      {
        name: 'send_agent_email',
        description:
          "Send email from the identity's primary address or an active alias, signed with its DKIM keys: text or HTML, cc, bcc, reply-to and scheduling. Reuse idempotencyKey on retries.",
        schema: SendEmailSchema,
        invoke: this.sendEmail.bind(this),
      },
      {
        name: 'list_agent_email',
        description: 'Query text-only agent email and extracted verification codes.',
        schema: ListEmailSchema,
        invoke: this.listEmail.bind(this),
      },
      {
        name: 'delete_agent_email',
        description: 'Permanently delete one email message from an agent inbox.',
        schema: DeleteEmailMessageSchema,
        invoke: this.deleteEmailMessage.bind(this),
      },
      {
        name: 'send_agent_email_batch',
        description: 'Queue up to 100 emails in one API request.',
        schema: BatchEmailSchema,
        invoke: this.sendEmailBatch.bind(this),
      },
      {
        name: 'get_agent_email_usage',
        description: 'Get combined monthly sent and received email usage.',
        schema: EmailUsageSchema,
        invoke: this.emailUsage.bind(this),
      },
      {
        name: 'configure_email_webhook',
        description: 'Configure signed inbound email events for this agent.',
        schema: EmailWebhookSchema,
        invoke: this.configureEmailWebhook.bind(this),
      },
      {
        name: 'get_renewal_status',
        description:
          'How the identity’s domain renews: whether automatic renewal is on, how it is paid (OpenSignet wallet or card), its yearly price, when it is charged (30 to 7 days before expiry), and the first thing in the way, if any.',
        schema: RenewalStatusSchema,
        invoke: this.renewalStatus.bind(this),
      },
      {
        name: 'set_auto_renew',
        description:
          'Turn automatic renewal of the identity’s domain on or off. Renewals from the OpenSignet wallet need the owner’s approval once on opensignet.com; until then turning it on fails with RENEWAL_APPROVAL_REQUIRED.',
        schema: SetAutoRenewSchema,
        invoke: this.setAutoRenew.bind(this),
      },
      {
        name: 'get_dns_capabilities',
        description: 'Get machine-readable DNS types, fields, limits, and provider constraints.',
        schema: ListDnsSchema,
        invoke: this.getDnsCapabilities.bind(this),
      },
      {
        name: 'list_dns_records',
        description: 'List DNS records for an OpenSignet identity.',
        schema: ListDnsSchema,
        invoke: this.listDns.bind(this),
      },
      {
        name: 'create_dns_record',
        description: 'Create a user-managed DNS record and sync it to the domain provider.',
        schema: CreateDnsSchema,
        invoke: this.createDns.bind(this),
      },
      {
        name: 'update_dns_record',
        description: 'Update a user-managed DNS record and sync it to the domain provider.',
        schema: UpdateDnsSchema,
        invoke: this.updateDns.bind(this),
      },
      {
        name: 'delete_dns_record',
        description: 'Delete a user-managed DNS record and sync the domain provider state.',
        schema: DeleteDnsSchema,
        invoke: this.deleteDns.bind(this),
      },
      {
        name: 'change_dns_records',
        description: 'Preview or apply a revision-protected DNS batch in merge or replace mode.',
        schema: ChangeDnsSchema,
        invoke: this.changeDns.bind(this),
      },
      {
        name: 'import_dns_zone',
        description:
          'Preview or apply a validated BIND zone import without deleting system-managed records.',
        schema: ImportDnsSchema,
        invoke: this.importDns.bind(this),
      },
      {
        name: 'export_dns_zone',
        description: 'Export user or permitted complete DNS state as a BIND zone file.',
        schema: ExportDnsSchema,
        invoke: this.exportDns.bind(this),
      },
      {
        name: 'get_service_plan',
        description:
          'Get the limits one identity has from its account plan. Plans cover the whole account and are bought by a person on opensignet.com.',
        schema: ServicePlanStatusSchema,
        invoke: this.getServicePlan.bind(this),
      },
      {
        name: 'update_primary_email',
        description:
          'Request a primary email username change. Inspect the returned phase; pending is not completion. The old primary stops receiving after completion.',
        schema: UpdatePrimaryEmailSchema,
        invoke: this.updatePrimaryEmail.bind(this),
      },
      {
        name: 'create_email_alias',
        description:
          'Request a receive-and-send alias. Requires paid-plan capacity. Inspect the returned phase before using a pending alias.',
        schema: CreateEmailAliasSchema,
        invoke: this.createEmailAlias.bind(this),
      },
      {
        name: 'delete_email_alias',
        description:
          'Request deletion of an active email alias. Inspect the returned phase; pending is not completion.',
        schema: DeleteEmailAliasSchema,
        invoke: this.deleteEmailAlias.bind(this),
      },
    ];
  }

  private async register(walletProvider: WalletProvider, args: z.infer<typeof RegisterSchema>) {
    const { ad, wallet } = this.createOpenSignet(walletProvider);

    // Checked against the shared contract before anything is sent.
    const registrant = args.registrant ? registrantSchema.parse(args.registrant) : this.registrant;
    const result = await ad.register({
      ...args,
      ...(registrant ? { registrant } : {}),
      emailEnabled: true,
      wallet,
    } as any);

    const renews = args.autoRenew
      ? ' It renews automatically each year; get_renewal_status shows anything in the way.'
      : ' Automatic renewal is off.';
    return `Registered ${result.domain}.${renews}`;
  }

  private async renewalStatus(
    walletProvider: WalletProvider,
    args: z.infer<typeof RenewalStatusSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    const status = await ad.getRenewal(args.agentId);
    const price = status.price
      ? `$${(Number(status.price) / 1e6).toFixed(2)} a year`
      : 'price not available yet';
    const state = status.autoRenew
      ? `renews automatically from the ${status.method === 'card' ? 'saved card' : 'OpenSignet wallet'}`
      : 'does not renew automatically';
    const next = status.ready ? 'Nothing stands in the way.' : (status.issue?.message ?? '');
    return `${status.domain} ${state} (${price}), expires ${status.expiresAt ?? 'once registered'}. ${next}`.trim();
  }

  private async setAutoRenew(
    walletProvider: WalletProvider,
    args: z.infer<typeof SetAutoRenewSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    const result = await ad.setAutoRenew(args.agentId, args.enabled);
    return result.autoRenew
      ? `${result.domain} now renews automatically.`
      : `${result.domain} no longer renews automatically; the owner is reminded before it expires.`;
  }

  private async listDns(walletProvider: WalletProvider, args: z.infer<typeof ListDnsSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    const records = await ad.listDnsRecords(args.agentId);
    return JSON.stringify(records, null, 2);
  }

  private async getDnsCapabilities(
    walletProvider: WalletProvider,
    args: z.infer<typeof ListDnsSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    return JSON.stringify(await ad.getDnsCapabilities(args.agentId), null, 2);
  }

  private async createDns(walletProvider: WalletProvider, args: z.infer<typeof CreateDnsSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    const { agentId, ...record } = args;
    const result = await ad.createDnsRecord(agentId, record as DnsRecordInput);
    return `Created ${result.type} record ${result.name} -> ${result.value}.`;
  }

  private async updateDns(walletProvider: WalletProvider, args: z.infer<typeof UpdateDnsSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    const { agentId, recordId, ...record } = args;
    const result = await ad.updateDnsRecord(agentId, recordId, record as Partial<DnsRecordInput>);
    return `Updated ${result.type} record ${result.name} -> ${result.value}.`;
  }

  private async deleteDns(walletProvider: WalletProvider, args: z.infer<typeof DeleteDnsSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    await ad.deleteDnsRecord(args.agentId, args.recordId);
    return `Deleted DNS record ${args.recordId}.`;
  }

  private async changeDns(walletProvider: WalletProvider, args: z.infer<typeof ChangeDnsSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    // The shared contract is authoritative for each record type's structured data.
    const records = args.records.map((record) => dnsRecordSchema.parse(record) as DnsRecordInput);
    const result = args.dryRun
      ? await ad.previewDnsBatch(args.agentId, records, args.mode)
      : await ad.applyDnsBatch(
          args.agentId,
          records,
          requireDnsRevision(args.baseRevision),
          args.mode,
        );
    return JSON.stringify(result, null, 2);
  }

  private async importDns(walletProvider: WalletProvider, args: z.infer<typeof ImportDnsSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    const result = args.dryRun
      ? await ad.previewDnsImport(args.agentId, args.zoneFile, args.mode)
      : await ad.applyDnsImport(
          args.agentId,
          args.zoneFile,
          requireDnsRevision(args.baseRevision),
          args.mode,
        );
    return JSON.stringify(result, null, 2);
  }

  private async exportDns(walletProvider: WalletProvider, args: z.infer<typeof ExportDnsSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    return ad.exportDnsZone(args.agentId, args.scope);
  }

  private async getServicePlan(
    walletProvider: WalletProvider,
    args: z.infer<typeof ServicePlanStatusSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    const result = await ad.getServicePlan(args.agentId);
    const { limits } = result.entitlement;
    const renewal = result.renewal
      ? ` The plan ${result.renewal.autoRenew ? 'renews' : 'ends'} on ${result.renewal.periodEnd}.`
      : '';
    return `This identity is on the account's ${result.entitlement.plan} plan: ${limits.monthlyEmails} emails a month, ${limits.apiKeys} API key(s), ${limits.dnsRecords} DNS records.${renewal} Plans are changed by a person on opensignet.com.`;
  }

  private async quote(walletProvider: WalletProvider, args: z.infer<typeof QuoteSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    const q = await ad.quote(args);
    const basenamePart = Number(q.basenameCostUsdc) > 0 ? ` + Basename $${q.basenameCostUsdc}` : '';
    const ensPart = Number(q.ensCostUsdc) > 0 ? ` + ENS $${q.ensCostUsdc}` : '';
    return `Total: $${q.totalUsdc} USDC (domain $${q.domainCostUsdc}, email included${basenamePart}${ensPart})`;
  }

  private async sendEmail(walletProvider: WalletProvider, args: z.infer<typeof SendEmailSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    const { agentId, ...message } = args;
    const result = await ad.sendEmail(agentId, message);
    return result.code
      ? `${result.message} Message ${result.id}.`
      : `Email ${result.status === 'scheduled' ? 'scheduled' : 'queued'}: ${result.id}`;
  }

  private async listEmail(walletProvider: WalletProvider, args: z.infer<typeof ListEmailSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    const result = await ad.listEmail(args.agentId, { limit: args.limit });
    return JSON.stringify(result, null, 2);
  }

  private async deleteEmailMessage(
    walletProvider: WalletProvider,
    args: z.infer<typeof DeleteEmailMessageSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    await ad.deleteEmailMessage(args.agentId, args.messageId);
    return `Deleted email message ${args.messageId}.`;
  }

  private async sendEmailBatch(
    walletProvider: WalletProvider,
    args: z.infer<typeof BatchEmailSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    return JSON.stringify(
      await ad.sendEmailBatch(args.agentId, {
        messages: args.messages,
        validationMode: args.validationMode,
        idempotencyKey: args.idempotencyKey,
      }),
      null,
      2,
    );
  }
  private async emailUsage(walletProvider: WalletProvider, args: z.infer<typeof EmailUsageSchema>) {
    const { ad } = this.createOpenSignet(walletProvider);
    return JSON.stringify(await ad.getEmailUsage(args.agentId), null, 2);
  }
  private async configureEmailWebhook(
    walletProvider: WalletProvider,
    args: z.infer<typeof EmailWebhookSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    return JSON.stringify(await ad.setEmailWebhook(args.agentId, args), null, 2);
  }

  private async updatePrimaryEmail(
    walletProvider: WalletProvider,
    args: z.infer<typeof UpdatePrimaryEmailSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    const result = await ad.updatePrimaryEmail(args.agentId, args.username, {
      idempotencyKey: args.idempotencyKey,
    });
    return 'change' in result ? JSON.stringify(result, null, 2) : result.message;
  }

  private async createEmailAlias(
    walletProvider: WalletProvider,
    args: z.infer<typeof CreateEmailAliasSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    const result = await ad.createEmailAlias(args.agentId, args.username, {
      idempotencyKey: args.idempotencyKey,
    });
    return 'change' in result
      ? JSON.stringify(result, null, 2)
      : `Created email alias ${result.address.emailAddress}.`;
  }

  private async deleteEmailAlias(
    walletProvider: WalletProvider,
    args: z.infer<typeof DeleteEmailAliasSchema>,
  ) {
    const { ad } = this.createOpenSignet(walletProvider);
    const result = await ad.deleteEmailAlias(args.agentId, args.emailAddress, {
      idempotencyKey: args.idempotencyKey,
    });
    return 'change' in result
      ? JSON.stringify(result, null, 2)
      : `Deleted email alias ${args.emailAddress}.`;
  }
}

function requireDnsRevision(value: string | undefined): string {
  if (!value) throw new Error('Apply requires baseRevision from a fresh DNS dry-run preview.');
  return value;
}

export default OpenSignetActionProvider;
