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
 *   GET    /api/v1/auth/google/start?intent=link&return_to=/settings/security
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
 *   POST   /api/v1/wallet/setup/start              -> { token }   opens the wallet window to create the wallet
 *   POST   /api/v1/wallet/export/start             -> { token }   opens the wallet window to export the key
 *   POST   /api/v1/wallet/passkeys/start           -> { token }   opens the wallet window to add a backup passkey
 *   POST   /api/v1/wallet/recovery-kit/start       -> { token }   opens the wallet window to create the recovery kit
 *   POST   /api/v1/wallet/recover/start            -> { token }   (step-up) restores access with the recovery kit
 *   DELETE /api/v1/account                         -> 204   (step-up; the wallet must be empty)
 *
 * The OpenSignet wallet is self-custodial: its key is created and locked with the person's
 * passkeys inside the wallet window, a popup on its own origin. The single-use token travels in
 * that window's URL fragment; the site never sees the key, and the window reports back only
 * through an origin-checked message (see wallet-window.ts).
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
    /** Null until the person creates their wallet. `passkeys` counts the passkeys that unlock it. */
    embeddedWallet: z
      .object({
        address,
        passkeys: z.number().int().min(0).max(50),
        /** Whether a recovery kit can restore the wallet if every passkey is lost. */
        recoveryKit: z.boolean(),
      })
      .strict()
      .nullable(),
    createdAt: isoDate,
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
  'wallet_exists',
] as const;

export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export type AccountSession = z.infer<typeof accountSessionSchema>;
export type AccountErrorCode = (typeof accountErrorCodes)[number];

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const AVATAR_CHANGES_PER_MONTH = 2;
