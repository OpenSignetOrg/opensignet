import { z } from 'zod';

/**
 * Sign-in and account contract shared by the sign-in page and the future backend. All requests are
 * same-origin under /api/v1 with the session in an HttpOnly cookie; nothing here is a secret.
 *
 * Email sign-in (passwordless, no separate sign-up):
 *   POST /api/v1/auth/email/start   { email, turnstileToken } -> 202 EmailChallenge
 *        Same answer whether or not an account exists. Sets the HttpOnly challenge cookie that binds
 *        the code to this browser.
 *   POST /api/v1/auth/email/verify  { code }                  -> 200 SignInResult
 * Google:
 *   GET  /api/v1/auth/google/start?return_to=/path            -> 302 to Google (code + PKCE + state + nonce)
 *   GET  /api/v1/auth/google/callback                          -> 302 to return_to (or /sign-in?error=...)
 * Wallet (EIP-4361):
 *   GET  /api/v1/auth/nonce, POST /api/v1/auth/verify          -> SignInResult
 * Session and onboarding:
 *   GET    /api/v1/auth/session                                -> Session
 *   DELETE /api/v1/auth/session                                -> 204
 *   POST   /api/v1/account/onboarding { displayName? }         -> 200 Account (name step: save or skip)
 *
 * Error bodies: { error: SignInErrorCode, attemptsRemaining?, retryAfterSeconds? }.
 */

export const DISPLAY_NAME_MAX_LENGTH = 50;
export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_MAX_LENGTH = 254;

const isoDate = z.string().datetime({ offset: true });

export const accountSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().max(DISPLAY_NAME_MAX_LENGTH).nullable(),
    email: z.string().max(EMAIL_MAX_LENGTH).nullable(),
    avatarUrl: z.string().nullable(),
    /** `name`: the account was just created and the optional name step has not been answered. */
    onboarding: z.enum(['name']).nullable(),
  })
  .strict();

export const sessionSchema = z.union([
  z.object({ authenticated: z.literal(false) }).strict(),
  z
    .object({
      authenticated: z.literal(true),
      account: accountSchema,
      /** The wallets this account pays from: the OpenSignet wallet first, then a linked wallet. */
      wallets: z
        .array(z.string().regex(/^0x[\da-fA-F]{40}$/))
        .max(2)
        .optional(),
      /** Present when this session was opened with a wallet signature: that wallet and its chain. */
      address: z
        .string()
        .regex(/^0x[\da-fA-F]{40}$/)
        .optional(),
      chainId: z.number().int().positive().optional(),
      expiresAt: z.number().int().positive().optional(),
    })
    .strict(),
]);

export const emailChallengeSchema = z
  .object({
    expiresAt: isoDate,
    resendAvailableAt: isoDate,
  })
  .strict();

export const signInResultSchema = z.object({ account: accountSchema }).strict();

export const signInErrorCodes = [
  'invalid_email',
  'invalid_code',
  'code_expired',
  'too_many_attempts',
  'rate_limited',
  'bot_check_failed',
  'invalid_name',
  'unauthenticated',
] as const;

export const signInErrorBodySchema = z
  .object({
    error: z.enum(signInErrorCodes),
    attemptsRemaining: z.number().int().nonnegative().optional(),
    retryAfterSeconds: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type Account = z.infer<typeof accountSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type EmailChallenge = z.infer<typeof emailChallengeSchema>;
export type SignInResult = z.infer<typeof signInResultSchema>;
export type SignInErrorCode = (typeof signInErrorCodes)[number];

/**
 * Results the Google callback reports on /sign-in?google=... (never personal data in the URL):
 * - `cancelled`: the person closed or declined Google's screen.
 * - `failed`: Google's answer could not be verified; nothing was changed.
 * - `confirm_email`: the Google email matches an existing account but is not a Gmail or Workspace
 *   address, so the backend has emailed a code (challenge cookie set) to prove the address once.
 */
export const googleCallbackResults = ['cancelled', 'failed', 'confirm_email'] as const;
export type GoogleCallbackResult = (typeof googleCallbackResults)[number];
