import type { ZodType } from 'zod';
import {
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  accountSchema,
  emailChallengeSchema,
  sessionSchema,
  signInErrorBodySchema,
  signInResultSchema,
  type Account,
  type EmailChallenge,
  type Session,
  type SignInErrorCode,
  type SignInResult,
} from './sign-in-contract';
import { API_TIMEOUT_MS } from './transport-policy';

export type SignInFailure =
  | SignInErrorCode
  /** The service could not be reached, timed out or answered with something unexpected. */
  | 'unavailable';

/** A failed sign-in step, with a plain-language message for the person. */
export class SignInError extends Error {
  readonly code: SignInFailure;
  readonly attemptsRemaining?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: SignInFailure,
    details: { attemptsRemaining?: number; retryAfterSeconds?: number } = {},
  ) {
    super(signInErrorMessage(code, details));
    this.name = 'SignInError';
    this.code = code;
    this.attemptsRemaining = details.attemptsRemaining;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

export function signInErrorMessage(
  code: SignInFailure,
  {
    attemptsRemaining,
    retryAfterSeconds,
  }: { attemptsRemaining?: number; retryAfterSeconds?: number },
): string {
  switch (code) {
    case 'invalid_email':
      return 'Enter a valid email address, like name@example.com.';
    case 'invalid_code':
      return attemptsRemaining === undefined
        ? 'That code isn’t right. Check the email and try again.'
        : `That code isn’t right. ${attemptsRemaining} ${attemptsRemaining === 1 ? 'try' : 'tries'} left.`;
    case 'code_expired':
      return 'This code has expired. Send a new code to continue.';
    case 'too_many_attempts':
      return 'Too many incorrect codes. Send a new code to continue.';
    case 'rate_limited':
      return retryAfterSeconds
        ? `Too many requests. Try again in ${formatWait(retryAfterSeconds)}.`
        : 'Too many requests. Wait a moment and try again.';
    case 'bot_check_failed':
      return 'We couldn’t confirm this request. Refresh the page and try again.';
    case 'invalid_name':
      return `Use 1 to ${DISPLAY_NAME_MAX_LENGTH} characters for your name.`;
    case 'unauthenticated':
      return 'Your sign-in expired. Start again to continue.';
    case 'unavailable':
      return 'Sign-in is temporarily unavailable. Try again in a moment.';
  }
}

function formatWait(seconds: number) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export interface SignInClient {
  session(signal?: AbortSignal): Promise<Session>;
  startEmail(email: string, turnstileToken: string, signal?: AbortSignal): Promise<EmailChallenge>;
  verifyEmail(code: string, signal?: AbortSignal): Promise<SignInResult>;
  completeOnboarding(displayName: string | null, signal?: AbortSignal): Promise<Account>;
}

/** Normalizes what the person typed; the server repeats every check. */
export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX_LENGTH) return null;
  // One @, a non-empty local part, a dotted domain and no spaces or control characters.
  if (
    !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]{2,}$/.test(
      email,
    )
  )
    return null;
  return email;
}

/** Trims and Unicode-normalizes a display name; null when it is empty or too long. */
export function normalizeDisplayName(value: string): string | null {
  const name = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!name || /[\u0000-\u001f\u007f-\u009f]/.test(name)) return null;
  if ([...name].length > DISPLAY_NAME_MAX_LENGTH) return null;
  return name;
}

/**
 * Only same-site paths are accepted as a destination after sign-in, so a crafted link can never send
 * someone to another site ("open redirect").
 */
export function safeReturnPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (value === '/sign-in' || value.startsWith('/sign-in?') || value.startsWith('/sign-in/'))
    return fallback;
  return value;
}

export function googleStartUrl(returnTo: string): string {
  return `/api/v1/auth/google/start?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function createSignInClient(fetcher: typeof fetch = fetch): SignInClient {
  async function call<T>(
    path: string,
    method: 'GET' | 'POST',
    schema: ZodType<T>,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const deadline = AbortSignal.timeout(API_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    let response: Response;
    try {
      response = await fetcher(`/api/v1/${path}`, {
        method,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: combined,
      });
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw new SignInError('unavailable');
    }

    const payload: unknown = await response.json().catch(() => null);
    if (signal?.aborted) throw signal.reason;
    if (!response.ok) {
      const parsed = signInErrorBodySchema.safeParse(payload);
      if (parsed.success) {
        throw new SignInError(parsed.data.error, {
          attemptsRemaining: parsed.data.attemptsRemaining,
          retryAfterSeconds: parsed.data.retryAfterSeconds,
        });
      }
      if (response.status === 401) throw new SignInError('unauthenticated');
      if (response.status === 429) throw new SignInError('rate_limited');
      throw new SignInError('unavailable');
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new SignInError('unavailable');
    return parsed.data;
  }

  return {
    session: (signal) => call('auth/session', 'GET', sessionSchema, undefined, signal),
    startEmail: (email, turnstileToken, signal) =>
      call('auth/email/start', 'POST', emailChallengeSchema, { email, turnstileToken }, signal),
    verifyEmail: (code, signal) =>
      call('auth/email/verify', 'POST', signInResultSchema, { code }, signal),
    completeOnboarding: (displayName, signal) =>
      call('account/onboarding', 'POST', accountSchema, displayName ? { displayName } : {}, signal),
  };
}
