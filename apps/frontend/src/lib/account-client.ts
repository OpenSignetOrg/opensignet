import { z, type ZodType } from 'zod';
import {
  AVATAR_MAX_BYTES,
  accountErrorCodes,
  accountSessionsSchema,
  accountSettingsSchema,
  walletTokenSchema,
  walletViewSchema,
  vaultChallengeSchema,
  vaultKeySchema,
  paymentSignatureSchema,
  nonceSchema,
  type AccountErrorCode,
  type AccountSession,
  type AccountSettings,
  type EmbeddedWallet,
  type VaultChallenge,
} from './account-contract';
import { emailChallengeSchema, signInErrorCodes, type EmailChallenge } from './sign-in-contract';
import { signInErrorMessage, type SignInFailure } from './sign-in-client';
import { API_TIMEOUT_MS } from './transport-policy';
import type { RenewalItem } from './auto-renew';

export type AccountFailure = SignInFailure | AccountErrorCode;

/** A code or signature sealed to the vault's key in this browser (see vault-seal.ts). */
export interface SealedProof {
  epk: string;
  iv: string;
  ciphertext: string;
}

const errorBodySchema = z
  .object({
    error: z.enum([...signInErrorCodes, ...accountErrorCodes]),
    attemptsRemaining: z.number().int().nonnegative().optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  })
  .passthrough();

/** A failed settings action, with a plain-language message for the person. */
export class AccountError extends Error {
  readonly code: AccountFailure;
  readonly attemptsRemaining?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AccountFailure,
    details: { attemptsRemaining?: number; retryAfterSeconds?: number } = {},
  ) {
    super(accountErrorMessage(code, details));
    this.name = 'AccountError';
    this.code = code;
    this.attemptsRemaining = details.attemptsRemaining;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

export function accountErrorMessage(
  code: AccountFailure,
  details: { attemptsRemaining?: number; retryAfterSeconds?: number } = {},
): string {
  switch (code) {
    case 'step_up_required':
      return 'Approve this change to continue.';
    case 'email_taken':
      return 'This email belongs to another OpenSignet account. Use a different email.';
    case 'email_same':
      return 'That’s already the email on your account.';
    case 'wallet_taken':
      return 'This wallet belongs to another OpenSignet account. Choose a different wallet.';
    case 'last_sign_in_method':
      return 'You need at least one way to sign in. Add another method before removing this one.';
    case 'avatar_limit':
      return 'You’ve changed your photo twice this month. You can change it again next month.';
    case 'invalid_image':
      return 'Use a PNG, JPG or WebP image up to 2 MB.';
    case 'wallet_not_empty':
      return 'Move the funds out of your OpenSignet wallet before deleting your account.';
    case 'wrong_signature':
      return 'That signature isn’t from the wallet linked to your account. Sign with that wallet.';
    case 'approval_required':
      return 'This approval has expired or was already used. Start again.';
    case 'no_approver':
      return 'There’s no way to approve this yet. Add an email or link a wallet first.';
    case 'wallet_unavailable':
      return 'Your wallet is unavailable right now. Nothing has changed; try again in a moment.';
    default:
      return signInErrorMessage(code, details);
  }
}

export interface AccountClient {
  get(signal?: AbortSignal): Promise<AccountSettings>;
  updateName(displayName: string | null): Promise<AccountSettings>;
  uploadAvatar(file: Blob): Promise<AccountSettings>;
  removeAvatar(): Promise<AccountSettings>;
  startEmail(email: string, turnstileToken: string): Promise<EmailChallenge>;
  verifyEmail(code: string): Promise<AccountSettings>;
  removeEmail(): Promise<AccountSettings>;
  unlinkGoogle(): Promise<AccountSettings>;
  walletNonce(): Promise<string>;
  linkWallet(message: string, signature: string): Promise<AccountSettings>;
  unlinkWallet(): Promise<AccountSettings>;
  sessions(signal?: AbortSignal): Promise<AccountSession[]>;
  revokeSession(id: string): Promise<void>;
  revokeOtherSessions(): Promise<void>;
  stepUpEmailStart(): Promise<EmailChallenge>;
  stepUpEmailVerify(code: string): Promise<void>;
  stepUpWalletNonce(): Promise<string>;
  stepUpWallet(message: string, signature: string): Promise<void>;
  wallet(signal?: AbortSignal): Promise<EmbeddedWallet | null>;
  /** The vault's public key, which approval proofs are sealed to. */
  vaultKey(): Promise<string>;
  startApproverChange(factor: 'email' | 'wallet'): Promise<VaultChallenge>;
  /** Relays a proof sealed in this browser; nothing on the way can read it. */
  completeApproval(challengeId: string, proof: SealedProof): Promise<void>;
  applyApproverChange(challengeId: string): Promise<EmbeddedWallet | null>;
  /** Single-use token for the wallet window's export. */
  walletExportToken(): Promise<string>;
  /** Asks for an approval to pay OpenSignet from the wallet (the exact checkout authorization). */
  /**
   * Pays OpenSignet from the OpenSignet wallet for a purchase (no code; the vault only pays
   * OpenSignet). `renews` also lets the item renew automatically. Returns the signature.
   */
  payFromWallet(payment: {
    to: string;
    value: string;
    validBefore: string;
    nonce: string;
    summary: string;
    renews?: RenewalItem | null;
  }): Promise<string>;
  deleteAccount(): Promise<void>;
  signOut(): Promise<void>;
}

const empty = z.unknown();

export function createAccountClient(fetcher: typeof fetch = fetch): AccountClient {
  async function call<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    schema: ZodType<T> | null,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const deadline = AbortSignal.timeout(API_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const binary = body instanceof Blob;
    let response: Response;
    try {
      response = await fetcher(`/api/v1/${path}`, {
        method,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(body === undefined
            ? {}
            : { 'Content-Type': binary ? body.type : 'application/json' }),
        },
        body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
        signal: combined,
      });
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw new AccountError('unavailable');
    }
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (signal?.aborted) throw signal.reason;
    if (!response.ok) {
      const parsed = errorBodySchema.safeParse(payload);
      if (parsed.success)
        throw new AccountError(parsed.data.error, {
          attemptsRemaining: parsed.data.attemptsRemaining,
          retryAfterSeconds: parsed.data.retryAfterSeconds,
        });
      if (response.status === 401) throw new AccountError('unauthenticated');
      if (response.status === 413) throw new AccountError('invalid_image');
      if (response.status === 429) throw new AccountError('rate_limited');
      throw new AccountError('unavailable');
    }
    if (!schema) return undefined as T;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new AccountError('unavailable');
    return parsed.data;
  }

  const settings = accountSettingsSchema;
  return {
    get: (signal) => call('account', 'GET', settings, undefined, signal),
    updateName: (displayName) => call('account', 'PATCH', settings, { displayName }),
    uploadAvatar: (file) => {
      if (file.size > AVATAR_MAX_BYTES) return Promise.reject(new AccountError('invalid_image'));
      return call('account/avatar', 'PUT', settings, file);
    },
    removeAvatar: () => call('account/avatar', 'DELETE', settings),
    startEmail: (email, turnstileToken) =>
      call('account/email/start', 'POST', emailChallengeSchema, { email, turnstileToken }),
    verifyEmail: (code) => call('account/email/verify', 'POST', settings, { code }),
    removeEmail: () => call('account/email', 'DELETE', settings),
    unlinkGoogle: () => call('account/google', 'DELETE', settings),
    walletNonce: async () => (await call('account/wallet/nonce', 'GET', nonceSchema)).nonce,
    linkWallet: (message, signature) =>
      call('account/wallet', 'PUT', settings, { message, signature }),
    unlinkWallet: () => call('account/wallet', 'DELETE', settings),
    sessions: async (signal) =>
      (await call('account/sessions', 'GET', accountSessionsSchema, undefined, signal)).sessions,
    revokeSession: (id) =>
      call(`account/sessions/${encodeURIComponent(id)}`, 'DELETE', empty).then(() => undefined),
    revokeOtherSessions: () =>
      call('account/sessions/revoke-others', 'POST', empty).then(() => undefined),
    stepUpEmailStart: () => call('auth/step-up/email/start', 'POST', emailChallengeSchema, {}),
    stepUpEmailVerify: (code) =>
      call('auth/step-up/email/verify', 'POST', empty, { code }).then(() => undefined),
    stepUpWalletNonce: async () =>
      (await call('auth/step-up/wallet/nonce', 'GET', nonceSchema)).nonce,
    stepUpWallet: (message, signature) =>
      call('auth/step-up/wallet', 'POST', empty, { message, signature }).then(() => undefined),
    wallet: async (signal) =>
      (await call('wallet', 'GET', walletViewSchema, undefined, signal)).wallet,
    vaultKey: async () => (await call('wallet/vault-key', 'GET', vaultKeySchema)).publicKey,
    startApproverChange: (factor) =>
      call('wallet/approvers/start', 'POST', vaultChallengeSchema, { factor }),
    completeApproval: (challengeId, proof) =>
      call(`wallet/approvals/${encodeURIComponent(challengeId)}/complete`, 'POST', empty, {
        proof,
      }).then(() => undefined),
    applyApproverChange: async (challengeId) =>
      (await call('wallet/approvers', 'POST', walletViewSchema, { challengeId })).wallet,
    walletExportToken: async () =>
      (await call('wallet/export/start', 'POST', walletTokenSchema, {})).token,
    payFromWallet: async (payment) =>
      (await call('wallet/payments', 'POST', paymentSignatureSchema, { payment })).signature,
    deleteAccount: () => call('account', 'DELETE', empty).then(() => undefined),
    signOut: () => call('auth/session', 'DELETE', empty).then(() => undefined),
  };
}
