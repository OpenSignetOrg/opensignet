import type { Address, Hex } from 'viem';
import {
  ENTERPRISE_EMAIL_TIERS,
  SERVICE_PLAN_INTERVALS,
  SERVICE_PLAN_KEYS,
  SUPPORTED_TLDS,
} from './constants.js';

export type SupportedTld = (typeof SUPPORTED_TLDS)[number];
export type ServicePlanKey = (typeof SERVICE_PLAN_KEYS)[number];
export type ServicePlanInterval = (typeof SERVICE_PLAN_INTERVALS)[number];
export type EnterpriseEmailTier = (typeof ENTERPRISE_EMAIL_TIERS)[number];
export type ServicePlanSku =
  'included' | 'plus' | 'pro' | 'max' | `enterprise-${EnterpriseEmailTier}`;

export interface ServicePlanLimits {
  monthlyEmails: number;
  requestsPerSecond: number;
  apiKeys: number;
  dnsRecords: number;
  emailAliases: number;
  emailRetentionDays: number;
}

export interface ServicePlanEntitlement {
  plan: ServicePlanKey;
  planSku?: ServicePlanSku;
  status: 'included' | 'active' | 'expired' | 'canceled';
  interval: ServicePlanInterval | null;
  autoRenew: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  limits: ServicePlanLimits;
  supportTier: string;
}

export interface RegistrationParams {
  preferredName: string;
  tld: SupportedTld;
  registerBasename: boolean;
  basenameLabel?: string;
  registerEns: boolean;
  ensLabel?: string;
  ownerAddress?: Address;
  emailEnabled: boolean;
  emailUsername?: string;
  years: number;
  autoRenew: boolean;
  dnsTarget?: string;
  metadata?: AgentMetadata;
  /**
   * The domain owner's details, which registries require for every domain. A signed-in account
   * saves them once (PUT /api/v1/registrant); a payer without an account sends them here.
   */
  registrant?: Registrant;
  wallet: Address;
  turnstileToken?: string;
}

/** The domain owner (registrant). Private: hidden from public WHOIS by domain privacy. */
export interface Registrant {
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
  /** International dialling code with the plus, for example "+880". */
  phoneCountryCode: string;
  /** The national number. */
  phoneNumber: string;
  street: string;
  city: string;
  state?: string;
  /** Empty where the country has no postal codes. */
  postalCode: string;
  /** ISO 3166-1 alpha-2, for example "BD". */
  country: string;
}

export interface RegistrationResult {
  registrationId?: string;
  agentId: string;
  nftTokenId: number;
  domain: string;
  basename: string | null;
  ensName: string | null;
  txHash: Hex;
  estimatedReadyAt: string;
  metadataUri: string;
  renewalSnapshot?: RenewalPriceSnapshot;
  provisioningStatus?: 'completed' | 'processing' | 'recovery_required';
  provisioningMessage?: string;
}

export interface RegistrationProgress {
  registrationId: string;
  status:
    'processing' | 'completed' | 'action_required' | 'failed' | 'refunded' | 'awaiting_payment';
  statusUrl: string;
  domain: string;
  agentId: string | null;
  paymentStatus: 'unknown' | 'pending' | 'settled' | 'not_charged' | 'refunded';
  /** Non-secret exact payment binding for authenticated terminal non-submission evidence. */
  paymentReference?: string;
  stage:
    | 'payment'
    | 'domain'
    | 'dns'
    | 'email'
    | 'basename'
    | 'ens'
    | 'mint'
    | 'finalizing'
    | 'complete';
  messageCode: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  revision: number;
  estimatedDurationSeconds: number | null;
  pollAfterSeconds: number;
  completionEventId: string | null;
  /** Only populated when the identity and all selected services are ready. */
  result?: RegistrationResult | null;
}

/** Minimum asynchronous acceptance; servers may include the remaining progress fields. */
export interface RegistrationAccepted extends Partial<RegistrationProgress> {
  registrationId: string;
  status: 'processing';
  statusUrl: string;
  domain: string;
  paymentStatus: 'settled';
  pollAfterSeconds: number;
}

export interface RegistrationListResult {
  items: RegistrationProgress[];
  hasMore: boolean;
  total: number;
}

/** Conclusive paid-request rejection; HTTP 408 and 5xx responses remain uncertain. */
export interface RegistrationPaymentRejection {
  code: string;
  message: string;
  /** When present, this alias must exactly equal code. */
  error?: string;
  paymentSubmission: {
    status: 'rejected';
    settlementAttempted: false;
  };
}

export interface AgentMetadata {
  name?: string;
  description?: string;
  imageUri?: string;
  framework?: string;
  capabilities?: string[];
  x402Endpoint?: string;
  socials?: Record<string, string>;
}

export interface PricingBreakdown {
  domainCostUsdc: string;
  basenameCostUsdc: string;
  ensCostUsdc: string;
  emailFeeUsdc: string;
  emailIncluded: boolean;
  includedServices: string[];
  providerCostUsdc: string;
  treasuryFeeUsdc: string;
  totalUsdc: string;
}

export type RenewalSnapshotItemKey = 'domain' | 'email' | 'basename' | 'ens';

export interface RenewalPriceSnapshotItem {
  key: RenewalSnapshotItemKey;
  label: string;
  name?: string;
  selected: boolean;
  provisioned: boolean;
  includedInAutoRenew: boolean;
  amountUsdc: string | null;
  amountAtomic: string | null;
  source: 'spaceship' | 'opensignet' | 'ses' | 'basenames' | 'ens';
  note?: string;
}

export interface RenewalPriceSnapshot {
  version: 1;
  capturedAt: string;
  years: number;
  currency: 'USDC';
  autoRenewTotalUsdc: string;
  autoRenewTotalAtomic: string;
  fullServiceTotalUsdc: string | null;
  fullServiceTotalAtomic: string | null;
  items: RenewalPriceSnapshotItem[];
  warnings: string[];
}

export interface EmailMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  providerMessageId?: string | null;
  fromAddress: string;
  toAddress?: string | null;
  subject?: string | null;
  text?: string | null;
  verificationCodes?: string[] | null;
  spamVerdict?: string | null;
  virusVerdict?: string | null;
  receivedAt: string;
  read: boolean;
}

export interface X402PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  asset: Address;
  extra: Record<string, unknown>;
}

export interface X402PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepts: X402PaymentRequirement[];
  extensions?: Record<string, unknown>;
}
