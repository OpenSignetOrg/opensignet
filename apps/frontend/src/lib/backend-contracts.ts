import { z } from 'zod';
import {
  dnsRecordObjectSchema,
  emailAddressChangeStatusSchema,
  emailAddressSummarySchema,
  emailServiceStatusSchema,
  type DnsRecordData,
} from '@opensignet/shared';

const nullableText = z.string().nullable();
const isoDate = z.string().datetime({ offset: true });
const address = z.string().regex(/^0x[\da-fA-F]{40}$/);
const httpsUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  });

export const emailInboxViewSchema = z
  .object({
    id: z.string(),
    agentId: z.string().uuid(),
    emailAddress: z.string(),
    verificationStatus: z.string(),
    dkimConfigured: z.boolean(),
    spfConfigured: z.boolean(),
    dmarcConfigured: z.boolean(),
    createdAt: isoDate,
  })
  .strict();

export type EmailAddressView = z.infer<typeof emailAddressSummarySchema>;

export const emailAddressObservationSchema = z.object({
  inbox: emailInboxViewSchema.strip().nullable(),
  addresses: z.array(emailAddressSummarySchema).optional(),
  addressChange: emailAddressChangeStatusSchema.nullable().optional(),
  mailStatus: emailServiceStatusSchema.optional(),
});

const dnsDataSchema: z.ZodType<DnsRecordData> = z.union([
  z.object({ address: z.string() }).strict(),
  z.object({ target: z.string() }).strict(),
  z
    .object({
      flag: z.union([z.literal(0), z.literal(128)]),
      tag: z.enum(['issue', 'issuewild', 'iodef']),
      value: z.string(),
    })
    .strict(),
  z
    .object({
      priority: z.number(),
      target: z.string(),
      params: z.array(z.object({ key: z.string(), value: z.string().optional() }).strict()),
    })
    .strict(),
  z.object({ priority: z.number(), exchange: z.string() }).strict(),
  z.object({ nameserver: z.string() }).strict(),
  z.object({ pointer: z.string() }).strict(),
  z
    .object({ priority: z.number(), weight: z.number(), port: z.number(), target: z.string() })
    .strict(),
  z
    .object({
      usage: z.number(),
      selector: z.number(),
      matchingType: z.number(),
      associationData: z.string(),
    })
    .strict(),
  z.object({ text: z.string() }).strict(),
]);

export const dnsRecordViewSchema = dnsRecordObjectSchema
  .extend({
    id: z.string(),
    value: z.string(),
    data: dnsDataSchema.nullable().optional(),
    ttl: z.number(),
    systemManaged: z.boolean().optional(),
    purpose: nullableText.optional(),
  })
  .strict();

/**
 * GET /api/v1/agents/:id/management-view, with the account session cookie (any sign-in method).
 * Identity data is private: there is no public profile, registry or lookup of someone else's
 * identity, so this view is the only place an identity's details are read.
 *   200  the signed-in account owns the identity: its AgentID is held by one of the account's
 *        wallets (its OpenSignet wallet or a linked one), or it was registered by the account.
 *   401  no session; 403 or 404  the account does not own it (the page never says which).
 * Every other identity-management route (keys, DNS, email, plan, renewal) applies the same rule.
 * On-chain actions (vault deposits and withdrawals, automatic renewal) are still signed by a wallet.
 */
export const managementViewSchema = z
  .object({
    agent: z
      .object({
        id: z.string().uuid(),
        domain: z.string(),
        basename: nullableText,
        ensName: nullableText,
        ownerAddress: address,
        /** Null until the AgentID is minted (the contracts deploy later). */
        agentIdNft: z.number().int().nonnegative().nullable(),
        status: z.enum(['pending', 'active', 'expired', 'revoked']),
        framework: nullableText,
        createdAt: isoDate,
        expiresAt: isoDate.nullable(),
        walletAddress: address,
        metadataUri: z
          .string()
          .refine((value) => {
            try {
              const url = new URL(value);
              return ['https:', 'ipfs:'].includes(url.protocol) && !url.username && !url.password;
            } catch {
              return false;
            }
          })
          .nullable(),
      })
      .strict(),
    dns: z.array(dnsRecordViewSchema),
    inbox: emailInboxViewSchema.nullable(),
    publicConfig: z
      .object({
        usdc: address,
        renewalVault: address.nullable(),
        metadataGateway: httpsUrl,
        builderCode: nullableText,
      })
      .strict(),
  })
  .strict();

export type EmailInboxView = z.infer<typeof emailInboxViewSchema>;
export type ManagementView = z.infer<typeof managementViewSchema>;
export type DnsRecordView = z.infer<typeof dnsRecordViewSchema>;
