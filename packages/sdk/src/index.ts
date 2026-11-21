import {
  type Address,
  type Hex,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
  getAddress,
  isAddress,
  maxUint256,
  zeroAddress,
  concatHex,
} from 'viem';
import { z } from 'zod';
import {
  emailAddressChangeResultSchema,
  emailAddressChangeStatusSchema,
  emailServiceStatusSchema,
  primaryEmailUpdatedSchema,
  emailAliasCreatedSchema,
  emailAliasDeletedSchema,
  type EmailAddressChange,
  type EmailAddressChangeResult,
  type EmailAddressChangeStatus,
  type EmailServiceStatus,
  type PrimaryEmailUpdateResult,
  type EmailAliasCreateResult,
  type EmailAliasDeleteResult,
} from '@opensignet/shared/schemas';
export type {
  EmailAddressChange,
  EmailAddressChangeResult,
  EmailAddressChangeStatus,
  EmailServiceStatus,
  PrimaryEmailUpdateResult,
  EmailAliasCreateResult,
  EmailAliasDeleteResult,
} from '@opensignet/shared/schemas';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import type { PaymentPayloadResult, PaymentRequirements } from '@x402/core/types';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import {
  BUILDER_CODE_PATTERN,
  encodeBuilderCodeSuffix,
  parseBuilderCodeSuffixFromCalldata,
} from '@x402/extensions/builder-code';
import type {
  DnsRecord,
  DnsRecordData,
  DnsRecordInput,
  DnsCapabilities,
  DnsBulkMode,
  DnsChangePreview,
  RegistrationParams,
  RegistrationResult,
  EmailMessage,
  ServicePlanKey,
} from '@opensignet/shared';
import {
  OPENSIGNET_API_BASE_URL,
  BASE_CHAIN_ID,
  USDC_BASE,
  X402_NETWORK,
} from '@opensignet/shared/constants';
import {
  RegistrationClient,
  encodeApiPathSegment,
  normalizeApiBaseUrl,
  type RegistrationHandle,
  type RegistrationListOptions,
  type RegistrationRequestOptions,
  type RegistrationWaitOptions,
} from './registration.js';
import type {
  RegistrationAccepted,
  RegistrationListResult,
  RegistrationProgress,
} from '@opensignet/shared';
import { createAgentSignatureHeader, type AgentSignatureRequest } from './agent-signature.js';
export {
  AGENT_SIGNATURE_AUDIENCE,
  agentRequestBodySha256,
  agentSignatureAudience,
  buildAgentSignatureMessage,
  canonicalAgentRequestTarget,
  createAgentSignatureHeader,
  createAgentSignatureNonce,
  type AgentSignatureRequest,
  type AgentSignatureSigner,
} from './agent-signature.js';
export {
  RegistrationPendingError,
  RegistrationFailedError,
  RegistrationPaymentRejectedError,
  type RegistrationHandle,
  type RegistrationListOptions,
  type RegistrationRequestOptions,
  type RegistrationWaitOptions,
  type RegistrationPendingReason,
  type RegistrationAccepted,
  type RegistrationListResult,
  type RegistrationProgress,
} from './registration.js';

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export interface OpenSignetOptions {
  /** Trusted application configuration, never an untrusted request parameter. Supports custom APIs. */
  apiUrl?: string;
  apiKey?: string;
  walletClient?: WalletClient<Transport, Chain, Account>;
  network?: 'base' | 'base-sepolia';
  /** Use the signed-in opensignet.com session cookie instead of signing registration requests with walletClient. */
  registrationAuth?: 'signature' | 'session';
  /** Payer identity expected for registration session reads; this does not authenticate requests. */
  registrationExpectedPayer?: Address;
}

/**
 * Validates a public ERC-8021 builder code without normalizing configuration mistakes.
 */
export function validateBuilderCode(builderCode: string): string {
  if (!BUILDER_CODE_PATTERN.test(builderCode)) {
    throw new Error('builderCode must contain 1-32 lowercase letters, numbers, or underscores.');
  }
  return builderCode;
}

/**
 * Appends one validated ERC-8021 Schema 2 app attribution suffix to EVM calldata.
 * Existing matching attribution is preserved; conflicting attribution is rejected.
 */
export function appendBuilderCodeAttribution(data: Hex, builderCode: string): Hex {
  const validated = validateBuilderCode(builderCode);
  const existing = parseBuilderCodeSuffixFromCalldata(data);
  if (existing) {
    if (existing.a === validated) return data;
    throw new Error('Transaction calldata already contains different builder-code attribution.');
  }
  return concatHex([data, encodeBuilderCodeSuffix({ a: validated })]);
}

/** Decodes an ERC-8021 builder-code suffix from complete transaction calldata. */
export function parseBuilderCodeAttribution(data: Hex) {
  return parseBuilderCodeSuffixFromCalldata(data);
}

export interface AvailabilityResult {
  available: boolean;
  domain?: string;
  reason?: string;
}

export interface QuoteResult {
  domain: string;
  basename?: string;
  ensName?: string;
  years: number;
  domainCostUsdc: string;
  basenameCostUsdc: string;
  ensCostUsdc: string;
  emailFeeUsdc: string;
  emailIncluded?: boolean;
  includedServices?: string[];
  providerCostUsdc?: string;
  treasuryFeeUsdc?: string;
  totalUsdc: string;
}

export type RegisterArgs = Omit<
  RegistrationParams,
  'wallet' | 'tld' | 'registerBasename' | 'registerEns' | 'emailEnabled' | 'years' | 'autoRenew'
> & {
  wallet?: Address;
  tld?: RegistrationParams['tld'];
  registerBasename?: boolean;
  registerEns?: boolean;
  emailEnabled?: boolean;
  years?: number;
  autoRenew?: boolean;
};

export interface AgentRow {
  id: string;
  domain: string;
  basename?: string;
  ensName?: string;
  status: string;
  walletAddress: Address;
  ownerAddress: Address;
}

export interface EmailResult {
  id: string;
  status: string;
  messages?: unknown[];
}

export interface EmailUsageResult {
  agentId: string;
  plan: ServicePlanKey;
  limit: number;
  sent: number;
  received: number;
  reserved: number;
  used: number;
  remaining: number;
  requestsPerSecond: number;
  cycleStart: string;
  cycleEnd: string;
}
export interface EmailWebhookConfig {
  agentId: string;
  url: string;
  payloadMode: 'metadata' | 'inline_text';
  enabled: boolean;
  secretVersion: number;
}

export interface EmailAddressSummary {
  id: string;
  agentId: string;
  emailAddress: string;
  kind: 'primary' | 'alias';
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface EmailListResult {
  inbox: unknown;
  addresses?: EmailAddressSummary[];
  limits?: { plan: ServicePlanKey; planLabel: string; emailAliases: number };
  messages: EmailMessage[];
  addressChange?: EmailAddressChangeStatus | null;
  mailStatus?: EmailServiceStatus;
}

export interface EmailAddressMutationOptions {
  /** Reuse the same UUID when explicitly retrying an unconfirmed request. */
  idempotencyKey?: string;
}

function emailAddressHeaders(options: EmailAddressMutationOptions) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey !== undefined)
    headers['Idempotency-Key'] = z.string().uuid().parse(options.idempotencyKey).toLowerCase();
  return headers;
}

async function emailAddressResult<T>(
  response: Response,
  legacy: z.ZodType<T>,
  action: EmailAddressChange['action'],
  options: EmailAddressMutationOptions,
): Promise<T | EmailAddressChangeResult> {
  const value: unknown = await response.json();
  if (response.status === 202 || (value && typeof value === 'object' && 'change' in value)) {
    const result = emailAddressChangeResultSchema.parse(value);
    if (
      result.change.action !== action ||
      (options.idempotencyKey &&
        result.change.requestId.toLowerCase() !== options.idempotencyKey.toLowerCase()) ||
      (response.status === 200) !== (result.change.phase === 'completed')
    )
      throw new Error('Invalid email address change response');
    return result;
  }
  return legacy.parse(value);
}

/**
 * The account's plan as it applies to one identity. Plans belong to the whole account and are
 * bought or changed by a person on opensignet.com (pricing page or dashboard), never through the
 * SDK or during registration.
 */
export interface ServicePlanStatusResult {
  entitlement: {
    plan: ServicePlanKey;
    planSku: string | null;
    limits: {
      monthlyEmails: number;
      apiKeys: number;
      dnsRecords: number;
      emailAliases: number;
      identities: number;
    };
  };
  /** How the account's plan renews; `null` on the free plan. Plans are changed on opensignet.com. */
  renewal: {
    status: string;
    autoRenew: boolean;
    method: 'wallet' | 'card';
    periodEnd: string;
  } | null;
}

/** Why a domain would not renew on its own today (the first thing to fix). */
export type RenewalIssueCode =
  | 'not_registered'
  | 'auto_renew_off'
  | 'price_unavailable'
  | 'approval_needed'
  | 'wallet_balance_low'
  | 'balance_unavailable'
  | 'card_missing';

/** How an identity's domain renews, from `GET /agents/{id}/renewal`. Amounts are USDC atomic units (6 decimals) as strings. */
export interface DomainRenewalStatus {
  agentId: string;
  domain: string;
  status: string;
  expiresAt: string | null;
  autoRenew: boolean;
  /** How renewals are paid: the account's OpenSignet wallet, or its saved card. */
  method: 'wallet' | 'card';
  /** One year at the registrar's price, or `null` while it can't be read. */
  price: string | null;
  /** When the renewal is charged: from 30 days until 7 days before the domain expires. */
  chargeWindow: { opensAt: string; closesAt: string } | null;
  /** Present when the wallet pays: its address, USDC balance and whether the owner approved it to pay this renewal. */
  wallet: { address: string | null; balance: string | null; approved: boolean } | null;
  cardSaved: boolean;
  /** True when nothing stands in the way of the next renewal. */
  ready: boolean;
  issue: { code: RenewalIssueCode; message: string } | null;
}

/** The identity's domain settings, from `GET /agents/{id}/domain`. */
export interface DomainSettings {
  domain: string;
  status: string;
  registered: boolean;
  registrar: string | null;
  registeredAt: string;
  expiresAt: string | null;
  autoRenew: boolean;
  autoRenewAvailable: boolean;
  renewalMethod: 'wallet' | 'card';
  renewalPrice: string | null;
  cardSaved: boolean;
  nameservers: string[];
  nameserversManaged: boolean;
  transferLock: boolean;
  whoisPrivacy: boolean;
}

export interface ApiKeySummary {
  id: string;
  agentId: string | null;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKeySummary {
  agentId: string;
  fullKey: string;
  warning?: string;
}

async function createRequestBoundPaymentPayload(
  requirements: PaymentRequirements,
  walletClient: WalletClient<Transport, Chain, Account>,
): Promise<PaymentPayloadResult> {
  const requestBinding = requirements.extra?.requestBinding;
  if (typeof requestBinding !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(requestBinding)) {
    throw new Error('Server returned an invalid x402 request binding.');
  }
  if (requirements.network !== X402_NETWORK || requirements.scheme !== 'exact') {
    throw new Error('OpenSignet request binding requires exact Base mainnet payments.');
  }
  if (
    typeof requirements.asset !== 'string' ||
    !isAddress(requirements.asset) ||
    getAddress(requirements.asset) !== USDC_BASE
  ) {
    throw new Error('OpenSignet request binding requires the Base USDC asset.');
  }
  if (
    requirements.extra?.assetTransferMethod !== undefined &&
    requirements.extra.assetTransferMethod !== 'eip3009'
  ) {
    throw new Error('OpenSignet request binding requires an EIP-3009 x402 authorization.');
  }
  if (requirements.extra?.name !== 'USD Coin' || requirements.extra.version !== '2') {
    throw new Error('Server returned an invalid Base USDC EIP-712 domain.');
  }
  if (
    typeof requirements.payTo !== 'string' ||
    !isAddress(requirements.payTo) ||
    getAddress(requirements.payTo) === zeroAddress
  ) {
    throw new Error('Server returned an invalid x402 payTo address.');
  }
  if (
    typeof requirements.amount !== 'string' ||
    !/^[0-9]+$/.test(requirements.amount) ||
    BigInt(requirements.amount) <= 0n ||
    BigInt(requirements.amount) > maxUint256
  ) {
    throw new Error(
      'Server returned an invalid x402 amount; expected positive uint256 atomic units.',
    );
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(requirements.maxTimeoutSeconds) ||
    requirements.maxTimeoutSeconds <= 0 ||
    !Number.isSafeInteger(now + requirements.maxTimeoutSeconds)
  ) {
    throw new Error('Server returned an invalid x402 authorization timeout.');
  }
  let validBefore = now + requirements.maxTimeoutSeconds;
  const quoteExpiresAt = requirements.extra?.quoteExpiresAt;
  if (quoteExpiresAt !== undefined) {
    const expiry = z.string().datetime({ offset: true }).safeParse(quoteExpiresAt);
    const expirySeconds = expiry.success ? Math.floor(Date.parse(expiry.data) / 1000) : NaN;
    if (!Number.isSafeInteger(expirySeconds)) {
      throw new Error('Server returned an invalid x402 quote expiry; expected an ISO timestamp.');
    }
    if (expirySeconds <= now) {
      throw new Error('The x402 checkout quote has expired.');
    }
    validBefore = Math.min(validBefore, expirySeconds);
  }

  // Bind the sole signature to the issued nonce without rewriting accepted requirements.
  const authorization = {
    from: getAddress(walletClient.account.address),
    to: getAddress(requirements.payTo),
    value: requirements.amount,
    validAfter: '0',
    validBefore: validBefore.toString(),
    nonce: requestBinding as Hex,
  };
  const signature = await walletClient.signTypedData({
    account: walletClient.account,
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: BASE_CHAIN_ID,
      verifyingContract: USDC_BASE,
    },
    types: EIP3009_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      ...authorization,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
    },
  });
  return { x402Version: 2, payload: { authorization, signature } };
}

export async function createX402PaymentHeaders(
  response: Response,
  walletClient: WalletClient<Transport, Chain, Account>,
): Promise<Record<string, string>> {
  if (!walletClient.account) {
    throw new Error('A connected wallet account is required for x402 payment.');
  }

  const signer = {
    address: walletClient.account.address,
    signTypedData: async (message: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }) =>
      walletClient.signTypedData({
        account: walletClient.account,
        ...message,
      } as Parameters<typeof walletClient.signTypedData>[0]),
  };

  // No implicit dollar cap; unbound payments retain the upstream asset policy.
  const client = new x402Client().setSpendControls(false);
  const exactScheme = new ExactEvmScheme(signer);
  client.register(X402_NETWORK, {
    scheme: exactScheme.scheme,
    findDefaultAsset: exactScheme.findDefaultAsset,
    createPaymentPayload: (version, requirements, context) => {
      // @x402/evm 2.25.0 has no nonce override. Use the public scheme interface
      // for bound EIP-3009 payments; leave unbound flows entirely upstream.
      return requirements.extra?.requestBinding === undefined
        ? exactScheme.createPaymentPayload(version, requirements, context)
        : createRequestBoundPaymentPayload(requirements, walletClient);
    },
  });
  const httpClient = new x402HTTPClient(client);

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => response.headers.get(name),
    body,
  );
  if (paymentRequired.x402Version !== 2) {
    throw new Error(
      `OpenSignet requires x402 v2; server returned v${paymentRequired.x402Version}.`,
    );
  }

  const payload = await httpClient.createPaymentPayload(paymentRequired);
  return httpClient.encodePaymentSignatureHeader(payload);
}

export class OpenSignet {
  private apiUrl: string;
  private apiKey?: string;
  private readonly registrationClient: RegistrationClient;
  readonly walletClient?: WalletClient<Transport, Chain, Account>;
  readonly network: 'base' | 'base-sepolia';

  constructor(opts?: OpenSignetOptions) {
    this.apiUrl = normalizeApiBaseUrl(opts?.apiUrl ?? OPENSIGNET_API_BASE_URL);
    this.apiKey = opts?.apiKey;
    this.walletClient = opts?.walletClient;
    this.network = opts?.network ?? 'base';
    this.registrationClient = new RegistrationClient({
      apiUrl: this.apiUrl,
      walletClient: this.walletClient,
      network: this.network,
      authentication: opts?.registrationAuth,
      expectedPayer: opts?.registrationExpectedPayer,
      createPaymentHeaders: createX402PaymentHeaders,
    });
  }

  async checkAvailability(name: string, opts: { tld: string }): Promise<AvailabilityResult> {
    const url = `${this.apiUrl}/domains/availability?name=${encodeURIComponent(name)}&tld=${encodeURIComponent(opts.tld)}`;
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    const res = await fetch(url);
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async quote(args: {
    preferredName: string;
    tld: string;
    registerBasename?: boolean;
    basenameLabel?: string;
    registerEns?: boolean;
    ensLabel?: string;
    emailEnabled?: boolean;
    emailUsername?: string;
    years?: number;
  }): Promise<QuoteResult> {
    const params = new URLSearchParams();
    params.set('preferredName', args.preferredName);
    params.set('tld', args.tld);
    if (args.registerBasename !== undefined)
      params.set('registerBasename', String(args.registerBasename));
    if (args.basenameLabel) params.set('basenameLabel', args.basenameLabel);
    if (args.registerEns !== undefined) params.set('registerEns', String(args.registerEns));
    if (args.ensLabel) params.set('ensLabel', args.ensLabel);
    if (args.emailEnabled !== undefined) params.set('emailEnabled', String(args.emailEnabled));
    if (args.emailUsername) params.set('emailUsername', args.emailUsername);
    if (args.years) params.set('years', String(args.years));
    const url = `${this.apiUrl}/agents/quote?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async register(
    args: RegisterArgs,
    options: RegistrationWaitOptions = {},
  ): Promise<RegistrationResult> {
    const expectedPayer =
      options.expectedPayer ?? args.wallet ?? this.walletClient?.account.address;
    const result = await this.submitRegistration(args, { signal: options.signal, expectedPayer });
    return 'status' in result
      ? this.waitForRegistration(result, { ...options, expectedPayer })
      : result;
  }

  async submitRegistration(
    args: RegisterArgs,
    options: RegistrationRequestOptions = {},
  ): Promise<RegistrationAccepted | RegistrationResult> {
    return this.registrationClient.submit(args, options);
  }

  async getRegistration(
    registrationId: string,
    options: RegistrationRequestOptions = {},
  ): Promise<RegistrationProgress> {
    return this.registrationClient.get(registrationId, options);
  }

  async getRegistrations(options: RegistrationListOptions = {}): Promise<RegistrationListResult> {
    return this.registrationClient.list(options);
  }

  async waitForRegistration(
    registration: string | RegistrationAccepted | RegistrationProgress | RegistrationHandle,
    options: RegistrationWaitOptions = {},
  ): Promise<RegistrationResult> {
    return this.registrationClient.wait(registration, options);
  }

  async recoverRegistration(
    handle: RegistrationHandle,
    options: RegistrationRequestOptions = {},
  ): Promise<RegistrationProgress> {
    return this.registrationClient.recover(handle, options);
  }

  async getAgentsByWallet(wallet: Address): Promise<AgentRow[]> {
    const url = `${this.apiUrl}/agents/by-wallet/${encodeApiPathSegment(wallet)}`;
    const res = await this.signedFetch(url, {
      authOptions: { useApiKey: false },
    });
    if (!res.ok) throw new Error(await responseError(res));
    const data = await res.json();
    return Array.isArray(data) ? data : data.agent ? [data.agent] : [];
  }

  async getAgentById(agentId: string): Promise<AgentRow> {
    const url = `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}`;
    const res = await this.signedFetch(url, {});
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async getAgent(wallet: Address): Promise<AgentRow | null> {
    const agents = await this.getAgentsByWallet(wallet);
    return agents[0] ?? null;
  }

  async sendEmail(
    agentId: string,
    args: {
      to: string | string[];
      subject: string;
      text: string;
      fromAddress?: string;
      replyTo?: string;
      idempotencyKey?: string;
    },
  ): Promise<EmailResult> {
    const url = `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/send`;
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    const res = await this.signedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : {}),
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async sendEmailBatch(
    agentId: string,
    args: {
      messages: Array<{
        to: string | string[];
        subject: string;
        text: string;
        fromAddress?: string;
        replyTo?: string;
      }>;
      validationMode?: 'strict' | 'partial';
      idempotencyKey?: string;
    },
  ) {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/batch`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          messages: args.messages,
          validationMode: args.validationMode ?? 'strict',
        }),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json() as Promise<{
      batchId: string;
      status: string;
      jobs: unknown[];
      errors: unknown[];
    }>;
  }

  async getEmailUsage(agentId: string): Promise<EmailUsageResult> {
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/usage`,
      {},
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async getEmailWebhook(agentId: string): Promise<{ webhook: EmailWebhookConfig | null }> {
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/webhook`,
      {},
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async setEmailWebhook(
    agentId: string,
    args: { url: string; payloadMode?: 'metadata' | 'inline_text'; enabled?: boolean },
  ): Promise<{ webhook: EmailWebhookConfig; signingSecret?: string }> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/webhook`, // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async rotateEmailWebhookSecret(
    agentId: string,
  ): Promise<{ webhook: EmailWebhookConfig; signingSecret: string }> {
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/webhook`,
      {
        method: 'PATCH',
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async updatePrimaryEmail(
    agentId: string,
    username: string,
    options: EmailAddressMutationOptions = {},
  ): Promise<PrimaryEmailUpdateResult> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email`,
      {
        method: 'PATCH',
        headers: emailAddressHeaders(options),
        body: JSON.stringify({ username, confirmReplace: true }),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return emailAddressResult(res, primaryEmailUpdatedSchema, 'primary-rename', options);
  }

  async createEmailAlias(
    agentId: string,
    username: string,
    options: EmailAddressMutationOptions = {},
  ): Promise<EmailAliasCreateResult> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/aliases`, // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
      {
        method: 'POST',
        headers: emailAddressHeaders(options),
        body: JSON.stringify({ username }),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return emailAddressResult(res, emailAliasCreatedSchema, 'alias-create', options);
  }

  async deleteEmailAlias(
    agentId: string,
    emailAddress: string,
    options: EmailAddressMutationOptions = {},
  ): Promise<EmailAliasDeleteResult> {
    const params = new URLSearchParams({ emailAddress });
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/aliases?${params}`, // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
      {
        method: 'DELETE',
        headers: emailAddressHeaders(options),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return emailAddressResult(res, emailAliasDeletedSchema, 'alias-delete', options);
  }

  async listEmail(
    agentId: string,
    args: { limit?: number; unreadOnly?: boolean; sync?: boolean } = {},
  ): Promise<EmailListResult> {
    const params = new URLSearchParams();
    if (args.limit) params.set('limit', String(args.limit));
    if (args.unreadOnly) params.set('unreadOnly', 'true');
    if (args.sync !== undefined) params.set('sync', String(args.sync));
    const url = `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email?${params.toString()}`;
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    const res = await this.signedFetch(url, {});
    if (!res.ok) throw new Error(await responseError(res));
    const result: EmailListResult = await res.json();
    if (result.addressChange !== undefined && result.addressChange !== null)
      result.addressChange = emailAddressChangeStatusSchema.parse(result.addressChange);
    if (result.mailStatus !== undefined)
      result.mailStatus = emailServiceStatusSchema.parse(result.mailStatus);
    return result;
  }

  async deleteEmailMessage(
    agentId: string,
    messageId: string,
  ): Promise<{ deleted: true; messageId: string }> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/email/${encodeApiPathSegment(messageId)}`, // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
      {
        method: 'DELETE',
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async listDnsRecords(agentId: string): Promise<DnsRecord[]> {
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/dns`,
      {},
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async getDnsCapabilities(agentId: string): Promise<DnsCapabilities> {
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/dns/capabilities`,
      {},
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async createDnsRecord(agentId: string, record: DnsRecordInput): Promise<DnsRecord> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/dns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async updateDnsRecord(
    agentId: string,
    recordId: string,
    record: Partial<DnsRecordInput>,
  ): Promise<DnsRecord> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/dns/${encodeApiPathSegment(recordId)}`, // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async deleteDnsRecord(agentId: string, recordId: string): Promise<{ success: boolean }> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/dns/${encodeApiPathSegment(recordId)}`, // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
      {
        method: 'DELETE',
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async previewDnsBatch(
    agentId: string,
    records: DnsRecordInput[],
    mode: DnsBulkMode = 'merge',
  ): Promise<DnsChangePreview> {
    return this.sendDnsBatch(agentId, { records, mode, dryRun: true });
  }

  async applyDnsBatch(
    agentId: string,
    records: DnsRecordInput[],
    baseRevision: string,
    mode: DnsBulkMode = 'merge',
  ): Promise<DnsChangePreview> {
    assertDnsRevision(baseRevision);
    return this.sendDnsBatch(agentId, { records, mode, dryRun: false, baseRevision });
  }

  async previewDnsImport(
    agentId: string,
    zoneFile: string,
    mode: DnsBulkMode = 'merge',
  ): Promise<DnsChangePreview> {
    return this.sendDnsImport(agentId, { zoneFile, mode, dryRun: true });
  }

  async applyDnsImport(
    agentId: string,
    zoneFile: string,
    baseRevision: string,
    mode: DnsBulkMode = 'merge',
  ): Promise<DnsChangePreview> {
    assertDnsRevision(baseRevision);
    return this.sendDnsImport(agentId, { zoneFile, mode, dryRun: false, baseRevision });
  }

  async exportDnsZone(agentId: string, scope: 'user' | 'all' = 'user'): Promise<string> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/dns/export?scope=${encodeURIComponent(scope)}`, // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
      {},
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.text();
  }

  private async sendDnsBatch(
    agentId: string,
    payload: {
      records: DnsRecordInput[];
      mode: DnsBulkMode;
      dryRun: boolean;
      baseRevision?: string;
    },
  ): Promise<DnsChangePreview> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/dns/batch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  private async sendDnsImport(
    agentId: string,
    payload: { zoneFile: string; mode: DnsBulkMode; dryRun: boolean; baseRevision?: string },
  ): Promise<DnsChangePreview> {
    // Trusted constructor API base; inputs are encoded path/query data, not destination URLs.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    const res = await this.signedFetch(
      `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/dns/import`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  /** The identity's domain: registration dates, renewal settings, nameservers and transfer lock. */
  async getDomain(agentId: string): Promise<DomainSettings> {
    const url = `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/domain`;
    const res = await this.signedFetch(url, {});
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  /**
   * How the identity's domain renews: whether automatic renewal is on, how it is paid, its price
   * and charge window, and the first thing standing in the way, if any.
   */
  async getRenewal(agentId: string): Promise<DomainRenewalStatus> {
    const url = `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/renewal`;
    const res = await this.signedFetch(url, {});
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  /**
   * Turns automatic renewal of the identity's domain on or off. Renewals from the OpenSignet
   * wallet need the owner's approval once, given on opensignet.com; until then turning it on
   * fails with `RENEWAL_APPROVAL_REQUIRED`. Code never widens what the wallet may pay.
   */
  async setAutoRenew(agentId: string, enabled: boolean): Promise<DomainSettings> {
    const url = `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/domain/auto-renew${enabled ? '' : '/off'}`;
    const res = await this.signedFetch(url, { method: 'POST' });
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async getServicePlan(agentId: string): Promise<ServicePlanStatusResult> {
    const url = `${this.apiUrl}/agents/${encodeApiPathSegment(agentId)}/plan`;
    const res = await this.signedFetch(url, {});
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async listApiKeys(agentId: string): Promise<ApiKeySummary[]> {
    const params = new URLSearchParams({ agentId });
    const res = await this.signedFetch(`${this.apiUrl}/keys?${params.toString()}`, {
      authOptions: { useApiKey: false },
    });
    if (!res.ok) throw new Error(await responseError(res));
    const data = (await res.json()) as { keys: ApiKeySummary[] };
    return data.keys;
  }

  async createApiKey(agentId: string, name: string): Promise<CreatedApiKey> {
    const res = await this.signedFetch(`${this.apiUrl}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      authOptions: { useApiKey: false },
      body: JSON.stringify({ agentId, name }),
    });
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  async revokeApiKey(keyId: string): Promise<{ revoked: boolean }> {
    const res = await this.signedFetch(`${this.apiUrl}/keys/${encodeApiPathSegment(keyId)}`, {
      method: 'DELETE',
      authOptions: { useApiKey: false },
    });
    if (!res.ok) throw new Error(await responseError(res));
    return res.json();
  }

  /** Authenticate one request; a wallet signature covers this exact method, URL and body. */
  private async signedFetch(
    url: string,
    init: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      authOptions?: { useApiKey?: boolean };
    },
  ): Promise<Response> {
    const { authOptions, ...request } = init;
    const method = request.method ?? 'GET';
    const headers = await this.authHeaders(
      { method, url, body: request.body },
      request.headers,
      authOptions,
    );
    // Callers pass only the trusted constructor API base plus encoded path/query data.
    // nosemgrep: nodejs_scan.javascript-ssrf-rule-node_ssrf
    return fetch(url, { ...request, method, headers });
  }

  private async authHeaders(
    request: AgentSignatureRequest,
    extra?: Record<string, string>,
    opts: { useApiKey?: boolean } = {},
  ): Promise<Record<string, string>> {
    const headers = { ...(extra ?? {}) };
    if ((opts.useApiKey ?? true) && this.apiKey && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.apiKey}`;
      return headers;
    }

    const walletClient = this.walletClient;
    const account = walletClient?.account;
    if (!headers['X-Agent-Signature'] && walletClient && account) {
      try {
        headers['X-Agent-Signature'] = await createAgentSignatureHeader(
          {
            address: account.address,
            signMessage: (message) => walletClient.signMessage({ account, message }),
          },
          request,
        );
      } catch {
        // Some browser wallet clients may not expose signMessage here. The
        // request can still proceed and let the API return the auth challenge.
      }
    }
    return headers;
  }
}

export function createOpenAITools(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'check_domain_availability',
        description: 'Check if a domain name is available for registration',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Domain name to check' },
            tld: { type: 'string', description: 'TLD (e.g. xyz, com, ai)', default: 'xyz' },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'quote_registration',
        description:
          'Get pricing quote for registering an AI agent identity. Domain, DNS, email and the OpenSignet Pass are included by default. Basename and ENS are optional.',
        parameters: {
          type: 'object',
          properties: {
            preferredName: { type: 'string', description: 'Preferred domain name' },
            tld: { type: 'string', description: 'TLD', default: 'xyz' },
            registerBasename: {
              type: 'boolean',
              description:
                'Also register a Basename on Base. Off by default; set true to add it and its cost.',
              default: false,
            },
            basenameLabel: {
              type: 'string',
              description: 'Optional alternate Basename label. Omit to use preferredName.',
            },
            registerEns: {
              type: 'boolean',
              description: 'Also register ENS name. Set false to skip ENS cost.',
              default: false,
            },
            ensLabel: {
              type: 'string',
              description: 'Optional alternate ENS label. Omit to use preferredName.',
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
            years: { type: 'number', description: 'Registration years', default: 1 },
          },
          required: ['preferredName'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'register_agent_identity',
        description:
          'Register a new AI agent identity. Domain, DNS, email and the OpenSignet Pass are included by default. Basename and ENS are optional.',
        parameters: {
          type: 'object',
          properties: {
            preferredName: { type: 'string', description: 'Domain name' },
            tld: { type: 'string', description: 'TLD', default: 'xyz' },
            registerBasename: {
              type: 'boolean',
              description:
                'Also register a Basename on Base. Off by default; set true to add it and its cost.',
              default: false,
            },
            basenameLabel: {
              type: 'string',
              description: 'Optional alternate Basename label. Omit to use preferredName.',
            },
            registerEns: {
              type: 'boolean',
              description: 'Register ENS. Set false to skip ENS cost.',
              default: false,
            },
            ensLabel: {
              type: 'string',
              description: 'Optional alternate ENS label. Omit to use preferredName.',
            },
            ownerAddress: {
              type: 'string',
              description:
                'Optional EVM address recorded as the identity owner. Omit to use the paying wallet.',
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
            dnsTarget: {
              type: 'string',
              description: 'Optional initial endpoint URL or IP to point the domain at.',
            },
            years: { type: 'number', description: 'Registration years', default: 1 },
          },
          required: ['preferredName'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'send_agent_email',
        description: 'Send text-only email from an agent primary email or active alias',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
            to: { type: 'string', description: 'Recipient email address' },
            subject: { type: 'string', description: 'Email subject' },
            text: { type: 'string', description: 'Plain-text email body' },
            fromAddress: {
              type: 'string',
              description: 'Optional primary email or active alias to send from',
            },
          },
          required: ['agentId', 'to', 'subject', 'text'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'list_agent_email',
        description: 'List an agent email messages and active primary/alias addresses',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
            limit: { type: 'number', description: 'Max messages', default: 20 },
          },
          required: ['agentId'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'delete_agent_email',
        description: 'Permanently delete one email message from an agent inbox',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
            messageId: { type: 'string', description: 'Email message ID (UUID)' },
          },
          required: ['agentId', 'messageId'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'update_primary_email',
        description:
          'Change one agent primary email username. The old primary address stops receiving new mail.',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
            username: { type: 'string', description: 'New local-part, e.g. agent or support' },
          },
          required: ['agentId', 'username'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'create_email_alias',
        description:
          'Create an extra receive-and-send email alias. Requires available paid-plan alias capacity.',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
            username: { type: 'string', description: 'Alias local-part, e.g. billing' },
          },
          required: ['agentId', 'username'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'delete_email_alias',
        description: 'Delete one active email alias from an agent',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
            emailAddress: { type: 'string', description: 'Full alias address to delete' },
          },
          required: ['agentId', 'emailAddress'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'get_renewal_status',
        description:
          'How the identity’s domain renews: whether automatic renewal is on, how it is paid (OpenSignet wallet or card), its yearly price, when it is charged (30 to 7 days before expiry), and the first thing in the way, if any.',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
          },
          required: ['agentId'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'set_auto_renew',
        description:
          'Turn automatic renewal of the identity’s domain on or off. Renewals from the OpenSignet wallet need the owner’s approval once on opensignet.com; until then turning it on fails with RENEWAL_APPROVAL_REQUIRED. Turning it off means the domain expires unless renewed; the owner is still reminded before it does.',
        parameters: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
            enabled: { type: 'boolean', description: 'true to renew automatically, false to stop' },
          },
          required: ['agentId', 'enabled'],
        },
      },
    },
  ];
}

export function createAnthropicTools(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return [
    {
      name: 'check_domain_availability',
      description: 'Check if a domain name is available for registration',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Domain name to check' },
          tld: { type: 'string', description: 'TLD (e.g. xyz, com, ai)', default: 'xyz' },
        },
        required: ['name'],
      },
    },
    {
      name: 'quote_registration',
      description:
        'Get pricing quote for registering an AI agent identity. Domain, DNS, email and the OpenSignet Pass are included by default. Basename and ENS are optional.',
      input_schema: {
        type: 'object',
        properties: {
          preferredName: { type: 'string', description: 'Preferred domain name' },
          tld: { type: 'string', description: 'TLD', default: 'xyz' },
          registerBasename: {
            type: 'boolean',
            description:
              'Also register a Basename on Base. Off by default; set true to add it and its cost.',
            default: false,
          },
          basenameLabel: {
            type: 'string',
            description: 'Optional alternate Basename label. Omit to use preferredName.',
          },
          registerEns: {
            type: 'boolean',
            description: 'Also register ENS name. Set false to skip ENS cost.',
            default: false,
          },
          ensLabel: {
            type: 'string',
            description: 'Optional alternate ENS label. Omit to use preferredName.',
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
          years: { type: 'number', description: 'Registration years', default: 1 },
        },
        required: ['preferredName'],
      },
    },
    {
      name: 'register_agent_identity',
      description:
        'Register a new AI agent identity. Domain, DNS, email and the OpenSignet Pass are included by default. Basename and ENS are optional.',
      input_schema: {
        type: 'object',
        properties: {
          preferredName: { type: 'string', description: 'Domain name' },
          tld: { type: 'string', description: 'TLD', default: 'xyz' },
          registerBasename: {
            type: 'boolean',
            description:
              'Also register a Basename on Base. Off by default; set true to add it and its cost.',
            default: false,
          },
          basenameLabel: {
            type: 'string',
            description: 'Optional alternate Basename label. Omit to use preferredName.',
          },
          registerEns: {
            type: 'boolean',
            description: 'Register ENS. Set false to skip ENS cost.',
            default: false,
          },
          ensLabel: {
            type: 'string',
            description: 'Optional alternate ENS label. Omit to use preferredName.',
          },
          ownerAddress: {
            type: 'string',
            description:
              'Optional EVM address recorded as the identity owner. Omit to use the paying wallet.',
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
          dnsTarget: {
            type: 'string',
            description: 'Optional initial endpoint URL or IP to point the domain at.',
          },
          years: { type: 'number', description: 'Registration years', default: 1 },
        },
        required: ['preferredName'],
      },
    },
    {
      name: 'send_agent_email',
      description: 'Send text-only email from an agent primary email or active alias',
      input_schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          text: { type: 'string', description: 'Plain-text email body' },
          fromAddress: {
            type: 'string',
            description: 'Optional primary email or active alias to send from',
          },
        },
        required: ['agentId', 'to', 'subject', 'text'],
      },
    },
    {
      name: 'list_agent_email',
      description: 'List an agent email messages and active primary/alias addresses',
      input_schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
          limit: { type: 'number', description: 'Max messages', default: 20 },
        },
        required: ['agentId'],
      },
    },
    {
      name: 'delete_agent_email',
      description: 'Permanently delete one email message from an agent inbox',
      input_schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
          messageId: { type: 'string', description: 'Email message ID (UUID)' },
        },
        required: ['agentId', 'messageId'],
      },
    },
    {
      name: 'update_primary_email',
      description:
        'Change one agent primary email username. The old primary address stops receiving new mail.',
      input_schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
          username: { type: 'string', description: 'New local-part, e.g. agent or support' },
        },
        required: ['agentId', 'username'],
      },
    },
    {
      name: 'create_email_alias',
      description:
        'Create an extra receive-and-send email alias. Requires available paid-plan alias capacity.',
      input_schema: {
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
      description: 'Delete one active email alias from an agent',
      input_schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
          emailAddress: { type: 'string', description: 'Full alias address to delete' },
        },
        required: ['agentId', 'emailAddress'],
      },
    },
    {
      name: 'get_renewal_status',
      description:
        'How the identity’s domain renews: whether automatic renewal is on, how it is paid (OpenSignet wallet or card), its yearly price, when it is charged (30 to 7 days before expiry), and the first thing in the way, if any.',
      input_schema: {
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
      input_schema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'OpenSignet agent ID (UUID)' },
          enabled: { type: 'boolean', description: 'true to renew automatically, false to stop' },
        },
        required: ['agentId', 'enabled'],
      },
    },
  ];
}

export async function runOpenSignetTool(
  ad: OpenSignet,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'check_domain_availability':
      return ad.checkAvailability(args.name as string, { tld: (args.tld as string) ?? 'xyz' });
    case 'quote_registration':
      return ad.quote({
        preferredName: args.preferredName as string,
        tld: (args.tld as string) ?? 'xyz',
        registerBasename: (args.registerBasename as boolean) ?? false,
        basenameLabel: args.basenameLabel as string | undefined,
        registerEns: (args.registerEns as boolean) ?? false,
        ensLabel: args.ensLabel as string | undefined,
        emailEnabled: true,
        emailUsername: args.emailUsername as string | undefined,
        years: (args.years as number) ?? 1,
      });
    case 'register_agent_identity':
      return ad.register({
        preferredName: args.preferredName as string,
        tld: ((args.tld as string | undefined) ?? 'xyz') as RegistrationParams['tld'],
        registerBasename: (args.registerBasename as boolean) ?? false,
        basenameLabel: args.basenameLabel as string | undefined,
        registerEns: (args.registerEns as boolean) ?? false,
        ensLabel: args.ensLabel as string | undefined,
        emailEnabled: true,
        emailUsername: args.emailUsername as string | undefined,
        years: (args.years as number) ?? 1,
        autoRenew: (args.autoRenew as boolean | undefined) ?? true,
        dnsTarget: args.dnsTarget as string | undefined,
        ownerAddress: args.ownerAddress as Address | undefined,
        wallet: args.wallet as Address | undefined,
      });
    case 'send_agent_email':
      return ad.sendEmail(args.agentId as string, {
        to: args.to as string | string[],
        fromAddress: args.fromAddress as string | undefined,
        subject: args.subject as string,
        text: args.text as string,
        replyTo: args.replyTo as string | undefined,
      });
    case 'list_agent_email':
      return ad.listEmail(args.agentId as string, { limit: (args.limit as number) ?? 20 });
    case 'delete_agent_email':
      return ad.deleteEmailMessage(args.agentId as string, args.messageId as string);
    case 'update_primary_email':
      return ad.updatePrimaryEmail(args.agentId as string, args.username as string);
    case 'create_email_alias':
      return ad.createEmailAlias(args.agentId as string, args.username as string);
    case 'delete_email_alias':
      return ad.deleteEmailAlias(args.agentId as string, args.emailAddress as string);
    case 'list_dns_records':
      return ad.listDnsRecords(args.agentId as string);
    case 'create_dns_record':
      return ad.createDnsRecord(args.agentId as string, readDnsRecordArgs(args) as DnsRecordInput);
    case 'update_dns_record':
      return ad.updateDnsRecord(
        args.agentId as string,
        args.recordId as string,
        readDnsRecordArgs(args),
      );
    case 'delete_dns_record':
      return ad.deleteDnsRecord(args.agentId as string, args.recordId as string);
    case 'get_service_plan':
      return ad.getServicePlan(args.agentId as string);
    case 'get_renewal_status':
      return ad.getRenewal(args.agentId as string);
    case 'set_auto_renew':
      if (typeof args.enabled !== 'boolean') throw new Error('enabled must be true or false.');
      return ad.setAutoRenew(args.agentId as string, args.enabled);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function readDnsRecordArgs(args: Record<string, unknown>): Partial<DnsRecordInput> {
  const record =
    args.record && typeof args.record === 'object'
      ? (args.record as Record<string, unknown>)
      : args;
  return {
    type: record.type as DnsRecord['type'] | undefined,
    name: record.name as string | undefined,
    value: record.value as string | undefined,
    data: record.data as DnsRecordData | undefined,
    ttl: record.ttl as number | undefined,
    priority: record.priority as number | null | undefined,
  };
}

function assertDnsRevision(value: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(
      'DNS apply requires the 64-character baseRevision returned by a fresh preview.',
    );
  }
}

export function formatOpenSignetToolResult(result: unknown): string {
  return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

async function responseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      message?: string;
      error?: string;
      code?: string;
      details?: unknown;
    };
    const detail = body.message ?? body.error;
    const code = body.code ?? body.error;
    const retryAfter =
      body.details && typeof body.details === 'object'
        ? (body.details as { retryAfterSeconds?: number }).retryAfterSeconds
        : undefined;
    const detailsMessage = detailsToMessage(body.details);
    const parts = [`HTTP ${res.status}`];
    if (code) parts.push(`[${code}]`);
    if (detail) parts.push(`: ${detail}`);
    if (detailsMessage && detailsMessage !== detail) parts.push(`: ${detailsMessage}`);
    if (retryAfter) parts.push(`(retry after ${retryAfter}s)`);
    return parts.join('');
  } catch {
    return `HTTP ${res.status}`;
  }
}

function detailsToMessage(details: unknown): string | null {
  if (!details) return null;
  if (typeof details === 'string') return details;
  if (typeof details !== 'object') return String(details);
  const record = details as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (typeof record.error === 'string') return record.error;
  try {
    return JSON.stringify(details);
  } catch {
    return null;
  }
}
