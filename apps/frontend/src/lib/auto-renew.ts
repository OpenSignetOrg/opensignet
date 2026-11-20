import { z } from 'zod';
import { accountPlanSchema, type AccountPlan } from '@/lib/account-plan';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';

/**
 * Automatic renewal is a switch. Plans and domains bought from the OpenSignet wallet renew from it
 * (the purchase includes the permission; turning it on later needs no code), plans bought by card
 * renew on the card. The vault signs each renewal only when it falls due, only to OpenSignet and
 * never above what the item may cost.
 *
 *   POST /api/v1/billing/plan/auto-renew              -> AccountPlan (on)
 *   POST /api/v1/billing/plan/auto-renew/off          -> AccountPlan (off)
 *   POST /api/v1/agents/:id/domain/auto-renew         -> domain settings (on)
 *   POST /api/v1/agents/:id/domain/auto-renew/off     -> domain settings (off)
 */

/** One item that may renew automatically, as a wallet payment carries it. */
export const renewalItemSchema = z
  .object({
    item: z.string(),
    maxCharge: z.string().regex(/^\d{1,30}$/),
    minGapDays: z.number().int(),
    label: z.string(),
  })
  .strict();
export type RenewalItem = z.infer<typeof renewalItemSchema>;

export class AutoRenewError extends Error {
  readonly kind: 'signin' | 'unavailable' | 'mismatch';
  constructor(kind: 'signin' | 'unavailable' | 'mismatch') {
    super(
      kind === 'signin'
        ? 'Your sign-in has ended. Sign in again to continue.'
        : kind === 'mismatch'
          ? 'Automatic renewal couldn’t be changed. Nothing changed; try again.'
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

export const turnAutoRenewOn = (): Promise<AccountPlan> =>
  call('auto-renew', accountPlanSchema, {});
export const turnAutoRenewOff = (): Promise<AccountPlan> =>
  call('auto-renew/off', accountPlanSchema, {});

/** Turns a domain's automatic renewal on or off; returns its settings parsed with `schema`. */
export const setDomainAutoRenew = <T>(id: string, on: boolean, schema: z.ZodType<T>): Promise<T> =>
  request(
    `/api/v1/agents/${encodeURIComponent(id)}/domain/auto-renew${on ? '' : '/off'}`,
    schema,
    {},
  );
