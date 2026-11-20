import { z } from 'zod';
import { DISPLAY_NAME_MAX_LENGTH, EMAIL_MAX_LENGTH } from './sign-in-contract';

/**
 * Account settings contract (same-origin, session cookie). Sensitive actions need a fresh approval
 * ("step-up"): the server answers 403 { error: 'step_up_required' } and the page asks the person to
 * approve with their own method (an email code, or a signature from their linked wallet), then
 * retries.
 *
 *   GET    /api/v1/account                         -> AccountSettings
 *   PATCH  /api/v1/account { displayName }         -> AccountSettings
 *   PUT    /api/v1/account/avatar  (image body)    -> AccountSettings   2 changes per calendar month (UTC)
 *   DELETE /api/v1/account/avatar                  -> AccountSettings   removing is free
 *   POST   /api/v1/account/email/start { email, turnstileToken } -> EmailChallenge   (step-up)
 *   POST   /api/v1/account/email/verify { code }   -> AccountSettings   add or change the one email
 *   DELETE /api/v1/account/email                   -> AccountSettings   wallet accounts only (step-up)
 *   GET    /api/v1/auth/google/start?intent=link&return_to=/settings
 *   DELETE /api/v1/account/google                  -> AccountSettings   (step-up)
 *   GET    /api/v1/account/wallet/nonce            -> { nonce }
 *   PUT    /api/v1/account/wallet { message, signature } -> AccountSettings   the one outside wallet
 *   DELETE /api/v1/account/wallet                  -> AccountSettings   (step-up)
 *   GET    /api/v1/account/sessions                -> { sessions: Session[] }
 *   DELETE /api/v1/account/sessions/:id            -> 204
 *   POST   /api/v1/account/sessions/revoke-others  -> 204
 *   POST   /api/v1/auth/step-up/email/start        -> EmailChallenge   code to the account email
 *   POST   /api/v1/auth/step-up/email/verify { code } -> 204
 *   GET    /api/v1/auth/step-up/wallet/nonce       -> { nonce }
 *   POST   /api/v1/auth/step-up/wallet { message, signature } -> 204
 *   GET    /api/v1/wallet                          -> { wallet: EmbeddedWallet | null }
 *   GET    /api/v1/wallet/vault-key                -> { publicKey, attestation }
 *   POST   /api/v1/wallet/approvers/start { factor } -> VaultChallenge   approve the current email and wallet as approvers
 *   POST   /api/v1/wallet/approvals/:id/complete { proof } -> 204       sealed code or signature
 *   POST   /api/v1/wallet/approvers { challengeId } -> { wallet }
 *   POST   /api/v1/wallet/export/start             -> { token }   opens the wallet window to export the key
 *   DELETE /api/v1/account                         -> 204   (step-up; the wallet must be empty)
 *
 * Every account gets its OpenSignet wallet automatically, moments after it is created. Its key is
 * held by the wallet vault, which acts only on approvals it checks itself: a code it emails to the
 * account, or a signature from the linked wallet. The browser seals those proofs to the vault's
 * key, so nothing in between can read them. Export happens in the wallet window, a popup on its own
 * origin that receives the key encrypted to a one-time key of its own (see wallet-window.ts).
 */

const isoDate = z.string().datetime({ offset: true });
const address = z.string().regex(/^0x[\da-fA-F]{40}$/);

export const accountSettingsSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().max(DISPLAY_NAME_MAX_LENGTH).nullable(),
    email: z.string().max(EMAIL_MAX_LENGTH).nullable(),
    /** How the account was first created; decides what can be removed. */
    createdWith: z.enum(['google', 'email', 'wallet']),
    avatar: z
      .object({
        url: z.string().nullable(),
        /** Changes still allowed this calendar month (UTC). */
        changesRemaining: z.number().int().min(0).max(2),
        resetsAt: isoDate,
      })
      .strict(),
    google: z
      .object({ email: z.string().max(EMAIL_MAX_LENGTH) })
      .strict()
      .nullable(),
    externalWallet: z.object({ address, linkedAt: isoDate }).strict().nullable(),
    /** Null only in the moments after sign-up, while the wallet is being created. */
    embeddedWallet: z.lazy(() => embeddedWalletSchema).nullable(),
    /**
     * Set when the account was deleted within the last 30 days and restored by signing in: a
     * delete before `permanentUntil` deletes it for good at once.
     */
    deletion: z.object({ permanentUntil: isoDate }).strict().nullable(),
    createdAt: isoDate,
  })
  .strict();

export const walletApproverSchema = z
  .object({
    kind: z.enum(['email', 'wallet']),
    /** A partly hidden email, or the checksummed wallet address. */
    display: z.string().min(1).max(260),
  })
  .strict();

export const embeddedWalletSchema = z
  .object({
    address,
    /** Who approves this wallet's actions; null when the vault can't be reached. */
    approvers: z.array(walletApproverSchema).max(3).nullable(),
    /** False after the email or linked wallet changed, until the old approvers confirm it. */
    approversInSync: z.boolean().nullable(),
  })
  .strict();

export const walletViewSchema = z.object({ wallet: embeddedWalletSchema.nullable() }).strict();

export const vaultKeySchema = z
  .object({ publicKey: z.string().min(80).max(100), attestation: z.unknown().nullable() })
  .strict();

export const vaultChallengeSchema = z
  .object({
    challengeId: z.string().uuid(),
    factor: z.enum(['email', 'wallet']),
    sentTo: z.string().min(1).max(260),
    /** The exact text the approver wallet signs (wallet approvals only). */
    message: z.string().max(2000).nullable(),
    browserCheck: z.string().max(20).nullable(),
    wallet: address,
    expiresAt: isoDate,
  })
  .strict();

export const paymentSignatureSchema = z
  .object({
    signature: z.string().regex(/^0x[\da-fA-F]{130}$/),
    authorization: z.object({}).passthrough(),
  })
  .strict();

export const accountSessionSchema = z
  .object({
    id: z.string().min(1),
    current: z.boolean(),
    /** Short, human description from the user agent, e.g. "Chrome on Windows". */
    device: z.string().max(120),
    /** Approximate place from the IP prefix, e.g. "Dhaka, Bangladesh"; null when unknown. */
    location: z.string().max(120).nullable(),
    method: z.enum(['google', 'email', 'wallet']),
    createdAt: isoDate,
    lastSeenAt: isoDate,
  })
  .strict();

export const accountSessionsSchema = z
  .object({ sessions: z.array(accountSessionSchema).max(100) })
  .strict();

export const nonceSchema = z.object({ nonce: z.string().min(8).max(128) }).strict();
export const walletTokenSchema = z.object({ token: z.string().regex(/^[\w-]{43}$/) }).strict();

export const accountErrorCodes = [
  'step_up_required',
  'email_taken',
  'email_same',
  'wallet_taken',
  'last_sign_in_method',
  'avatar_limit',
  'invalid_image',
  'wallet_not_empty',
  'permanent_deletion_unconfirmed',
  'wrong_signature',
  'approval_required',
  'no_approver',
  'wallet_unavailable',
] as const;

export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export type AccountSession = z.infer<typeof accountSessionSchema>;
export type EmbeddedWallet = z.infer<typeof embeddedWalletSchema>;
export type WalletApprover = z.infer<typeof walletApproverSchema>;
export type VaultChallenge = z.infer<typeof vaultChallengeSchema>;
export type AccountErrorCode = (typeof accountErrorCodes)[number];

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const AVATAR_CHANGES_PER_MONTH = 2;
