import { z } from 'zod';
import { accountPlanSchema, type AccountPlan } from '@/lib/account-plan';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';

/**
 * Automatic plan renewal from the OpenSignet wallet (plans paid in USDC).
 *
 *   GET  /api/v1/billing/plan/auto-renew/terms -> MandateTerms   what the owner approves
 *   POST /api/v1/billing/plan/auto-renew { renewals }            -> AccountPlan (turned on)
 *   GET  /api/v1/billing/plan/auto-renew/off   -> { nonces }      what the vault must cancel
 *   POST /api/v1/billing/plan/auto-renew/off { authorizer, cancellations } -> AccountPlan
 *
 * Turning it on, the owner approves with the wallet vault a fixed number of exact USDC payments
 * to OpenSignet, one per renewal, each usable only around its own due date. Funds stay in the
 * wallet until each charge. Turning it off cancels every unused payment on chain.
 */

export const mandateTermsSchema = z
  .object({
    to: z.string().regex(/^0x[\da-fA-F]{40}$/),
    value: z.string().regex(/^\d{1,30}$/),
    periodSeconds: z.number().int().positive(),
    firstDueAt: z.number().int(),
    count: z.number().int().min(1).max(24),
    leadSeconds: z.number().int().nonnegative(),
    graceSeconds: z.number().int().nonnegative(),
    summary: z.string().min(1).max(120),
  })
  .strict();
export type MandateTerms = z.infer<typeof mandateTermsSchema>;

export const signedRenewalsSchema = z
  .object({
    renewals: z
      .array(
        z
          .object({
            dueAt: z.number().int(),
            authorization: z
              .object({
                from: z.string(),
                to: z.string(),
                value: z.string(),
                validAfter: z.string(),
                validBefore: z.string(),
                nonce: z.string(),
              })
              .strict(),
            signature: z.string().regex(/^0x[\da-fA-F]{130}$/),
          })
          .strict(),
      )
      .max(24),
  })
  .strict();
export type SignedRenewals = z.infer<typeof signedRenewalsSchema>;

export const cancellationsSchema = z
  .object({
    authorizer: z.string().regex(/^0x[\da-fA-F]{40}$/),
    cancellations: z
      .array(
        z
          .object({ nonce: z.string(), signature: z.string().regex(/^0x[\da-fA-F]{130}$/) })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type Cancellations = z.infer<typeof cancellationsSchema>;

export class AutoRenewError extends Error {
  readonly kind: 'signin' | 'unavailable' | 'mismatch';
  constructor(kind: 'signin' | 'unavailable' | 'mismatch') {
    super(
      kind === 'signin'
        ? 'Your sign-in has ended. Sign in again to continue.'
        : kind === 'mismatch'
          ? 'The renewal approval didn’t match your plan. Nothing changed; try again.'
          : 'Automatic renewal can’t be changed right now. Nothing changed; try again in a moment.',
    );
    this.kind = kind;
  }
}

async function call<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  return request(`/api/v1/billing/plan/${path}`, schema, body);
}

async function request<T>(url: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    throw new AutoRenewError('unavailable');
  }
  if (response.status === 401) throw new AutoRenewError('signin');
  if (response.status === 400) throw new AutoRenewError('mismatch');
  if (!response.ok) throw new AutoRenewError('unavailable');
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new AutoRenewError('unavailable');
  return parsed.data;
}

export const autoRenewTerms = () => call('auto-renew/terms', mandateTermsSchema);
export const turnAutoRenewOn = (renewals: SignedRenewals['renewals']): Promise<AccountPlan> =>
  call('auto-renew', accountPlanSchema, { renewals });
export const autoRenewOffNonces = async () =>
  (await call('auto-renew/off', z.object({ nonces: z.array(z.string()).max(50) }).strict())).nonces;
export const turnAutoRenewOff = (cancellations: Cancellations | null): Promise<AccountPlan> =>
  call(
    'auto-renew/off',
    accountPlanSchema,
    cancellations ?? { authorizer: null, cancellations: [] },
  );

/**
 * Automatic renewal of one identity's domain, yearly, from the OpenSignet wallet:
 *
 *   GET  /api/v1/agents/:id/domain/auto-renew/terms -> MandateTerms
 *   POST /api/v1/agents/:id/domain/auto-renew { renewals }            -> domain settings
 *   GET  /api/v1/agents/:id/domain/auto-renew/off   -> { nonces }
 *   POST /api/v1/agents/:id/domain/auto-renew/off { authorizer, cancellations } -> domain settings
 *
 * Each payment can only be charged from 30 days to 7 days before the domain expires.
 */
const domainPath = (id: string, path: string) =>
  `/api/v1/agents/${encodeURIComponent(id)}/domain/${path}`;
export const domainAutoRenewTerms = (id: string) =>
  request(domainPath(id, 'auto-renew/terms'), mandateTermsSchema);
export const turnDomainAutoRenewOn = <T>(
  id: string,
  renewals: SignedRenewals['renewals'],
  schema: z.ZodType<T>,
): Promise<T> => request(domainPath(id, 'auto-renew'), schema, { renewals });
export const domainAutoRenewOffNonces = async (id: string) =>
  (
    await request(
      domainPath(id, 'auto-renew/off'),
      z.object({ nonces: z.array(z.string()).max(50) }).strict(),
    )
  ).nonces;
export const turnDomainAutoRenewOff = <T>(
  id: string,
  cancellations: Cancellations | null,
  schema: z.ZodType<T>,
): Promise<T> =>
  request(
    domainPath(id, 'auto-renew/off'),
    schema,
    cancellations ?? { authorizer: null, cancellations: [] },
  );
