import { z } from 'zod';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';

/**
 * The account's plan. Plans (Free, Plus, Pro, Max, Enterprise) apply to the whole account and to
 * every identity in it. They are bought and changed from the pricing page and checkout (card through
 * Stripe, or USDC on Base), never during domain registration or on an identity page.
 *
 *   GET /api/v1/billing/plan   (account session cookie)
 *     200 AccountPlan · 401 signed out
 *
 * Each identity's limits come from this plan:
 *   GET   /api/v1/agents/:id/plan   -> IdentityPlan (the account plan as it applies here)
 */

const isoDate = z.string().datetime({ offset: true });
const planKey = z.enum(['included', 'plus', 'pro', 'max', 'enterprise']);
export type PlanKey = z.infer<typeof planKey>;

export const accountPlanSchema = z
  .object({
    plan: planKey,
    /** `enterprise-<monthly emails>` for Enterprise, otherwise the plan key. */
    sku: z.string().max(40).nullable(),
    period: z.enum(['monthly', 'yearly']).nullable(),
    status: z.enum(['active', 'past_due', 'canceled', 'pending']),
    /** End of the paid period; null on the Free plan. */
    currentPeriodEnd: isoDate.nullable(),
    /** The plan ends at `currentPeriodEnd` instead of renewing. */
    cancelAtPeriodEnd: z.boolean(),
    paymentMethod: z.enum(['card', 'crypto']).nullable(),
  })
  .strict();
export type AccountPlan = z.infer<typeof accountPlanSchema>;

const limitsSchema = z.object({
  monthlyEmails: z.number().int().nonnegative(),
  apiKeys: z.number().int().nonnegative(),
  dnsRecords: z.number().int().nonnegative(),
  emailAliases: z.number().int().nonnegative(),
});

export const identityPlanSchema = z.object({
  entitlement: z.object({
    plan: planKey,
    planSku: z.string().max(40).optional().nullable(),
    limits: limitsSchema,
  }),
});
export type IdentityPlan = z.infer<typeof identityPlanSchema>;

/** "Pro", or "Enterprise · 500,000 emails" for an Enterprise tier. */
export function planName(plan: PlanKey, sku?: string | null): string {
  if (plan === 'enterprise' && sku?.startsWith('enterprise-')) {
    const offer = ENTERPRISE_PLAN_OFFERS.find((entry) => entry.sku === sku);
    if (offer) return `Enterprise · ${offer.monthlyEmails.toLocaleString('en-US')} emails`;
  }
  return SERVICE_PLAN_CATALOG[plan].label;
}

export class AccountPlanError extends Error {
  readonly kind: 'signed-out' | 'unavailable';
  constructor(kind: 'signed-out' | 'unavailable') {
    super(kind);
    this.kind = kind;
  }
}

export async function fetchAccountPlan(signal?: AbortSignal): Promise<AccountPlan> {
  let response: Response;
  try {
    response = await fetch('/api/v1/billing/plan', {
      credentials: 'include',
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)])
        : AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AccountPlanError('unavailable');
  }
  if (response.status === 401) throw new AccountPlanError('signed-out');
  if (!response.ok) throw new AccountPlanError('unavailable');
  const parsed = accountPlanSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new AccountPlanError('unavailable');
  return parsed.data;
}
