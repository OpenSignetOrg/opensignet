import { z } from 'zod';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import type { ServicePlanSku } from '@opensignet/shared';

/**
 * Plan checkout for the whole account: card through Stripe Checkout, or crypto (USDC on Base,
 * approved in the wallet through x402).
 *
 * Security rules this module enforces on the client:
 * - Only known plans and billing periods are accepted from the address bar; anything else is
 *   ignored, never forwarded.
 * - Prices shown here come from the shared catalog for display only. The request names the plan and
 *   period; the server decides the amount.
 * - Card checkout may only redirect to Stripe's own checkout origin.
 * - Every attempt carries one idempotency key, reused when the same attempt is retried, so a payment
 *   can never be taken twice for one click.
 * - Server responses are validated before use; anything unexpected is treated as unavailable.
 */

export type BillingPeriod = 'monthly' | 'yearly';
export type PaidPlanKey = 'plus' | 'pro' | 'max' | 'enterprise';
export type CheckoutMethod = 'card' | 'crypto';

export interface CheckoutSelection {
  plan: PaidPlanKey;
  /** `plus`, `pro`, `max` or `enterprise-<monthly emails>`. */
  sku: ServicePlanSku;
  period: BillingPeriod;
}

export const BILLING_PERIODS: readonly BillingPeriod[] = ['monthly', 'yearly'];
const SIMPLE_PLANS = ['plus', 'pro', 'max'] as const;
const ENTERPRISE_SKUS = new Set<string>(ENTERPRISE_PLAN_OFFERS.map((offer) => offer.sku));

export const CHECKOUT_API = '/api/v1/billing/checkout';
export const STRIPE_CHECKOUT_ORIGIN = 'https://checkout.stripe.com';

/** Reads the plan and period from the address bar; returns null for anything unknown. */
export function parseCheckoutSelection(
  planParam: string | null,
  periodParam: string | null,
): CheckoutSelection | null {
  const plan = (planParam ?? '').trim().toLowerCase();
  const period: BillingPeriod = periodParam === 'yearly' ? 'yearly' : 'monthly';
  if ((SIMPLE_PLANS as readonly string[]).includes(plan)) {
    return { plan: plan as PaidPlanKey, sku: plan as ServicePlanSku, period };
  }
  if (plan === 'enterprise') {
    const first = ENTERPRISE_PLAN_OFFERS[0];
    return first ? { plan: 'enterprise', sku: first.sku as ServicePlanSku, period } : null;
  }
  if (ENTERPRISE_SKUS.has(plan)) {
    return { plan: 'enterprise', sku: plan as ServicePlanSku, period };
  }
  return null;
}

export function checkoutPath(selection: Pick<CheckoutSelection, 'sku' | 'period'>): string {
  return `/checkout?${new URLSearchParams({ plan: selection.sku, period: selection.period }).toString()}`;
}

export interface CheckoutPrice {
  /** Amount charged for the chosen period, in USDC atomic units (6 decimals) = US cents × 10,000. */
  amountAtomic: bigint;
  monthlyEmails: number;
}

export function checkoutPrice(selection: CheckoutSelection): CheckoutPrice {
  if (selection.plan === 'enterprise') {
    const offer = ENTERPRISE_PLAN_OFFERS.find((item) => item.sku === selection.sku);
    if (!offer) throw new Error('Unknown Enterprise volume');
    return {
      amountAtomic:
        selection.period === 'monthly' ? offer.monthlyPriceUsdcAtomic : offer.yearlyPriceUsdcAtomic,
      monthlyEmails: offer.monthlyEmails,
    };
  }
  const entry = SERVICE_PLAN_CATALOG[selection.plan];
  return {
    amountAtomic:
      selection.period === 'monthly' ? entry.monthlyPriceUsdcAtomic : entry.yearlyPriceUsdcAtomic,
    monthlyEmails: entry.limits.monthlyEmails,
  };
}

/** "$10.00" style amount for a checkout total. */
export function formatCheckoutAmount(atomic: bigint): string {
  const cents = Number(atomic / 10_000n);
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Only Stripe's hosted checkout page may receive the visitor. */
export function isStripeCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === STRIPE_CHECKOUT_ORIGIN &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.port === ''
    );
  } catch {
    return false;
  }
}

const checkoutIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/);

export function isCheckoutId(value: string | null | undefined): value is string {
  return checkoutIdSchema.safeParse(value).success;
}

const cardStartSchema = z.object({
  method: z.literal('card'),
  checkoutId: checkoutIdSchema,
  checkoutUrl: z.string().refine(isStripeCheckoutUrl),
});

const cryptoStartSchema = z.object({
  method: z.literal('crypto'),
  checkoutId: checkoutIdSchema,
});

export const CHECKOUT_STATUSES = ['pending', 'paid', 'failed', 'expired', 'canceled'] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

const checkoutStatusSchema = z.object({
  checkoutId: checkoutIdSchema,
  status: z.enum(CHECKOUT_STATUSES),
  plan: z.enum(['plus', 'pro', 'max', 'enterprise']),
  planSku: z.string().max(40),
  period: z.enum(['monthly', 'yearly']),
});

export type CheckoutStatusResult = z.infer<typeof checkoutStatusSchema>;

export type CheckoutErrorKind = 'signin' | 'invalid' | 'conflict' | 'unavailable';

/** Plain-language checkout failures; never shows codes or server text. */
export class CheckoutError extends Error {
  readonly kind: CheckoutErrorKind;
  constructor(kind: CheckoutErrorKind) {
    super(CHECKOUT_ERROR_COPY[kind]);
    this.name = 'CheckoutError';
    this.kind = kind;
  }
}

export const CHECKOUT_ERROR_COPY: Record<CheckoutErrorKind, string> = {
  signin: 'Your sign-in has ended. Sign in again to continue. Nothing was charged.',
  invalid: 'This plan cannot be bought right now. Choose it again on the pricing page.',
  conflict:
    'A payment for this plan is already in progress. Wait a moment, then check your dashboard.',
  unavailable: 'Payments are not available right now. Nothing was charged. Please try again later.',
};

function errorForStatus(status: number): CheckoutError {
  if (status === 401 || status === 403) return new CheckoutError('signin');
  if (status === 400 || status === 422) return new CheckoutError('invalid');
  if (status === 409) return new CheckoutError('conflict');
  return new CheckoutError('unavailable');
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

type Fetcher = typeof fetch;

function requestBody(selection: CheckoutSelection, method: CheckoutMethod) {
  return JSON.stringify({
    plan: selection.plan,
    planSku: selection.sku,
    period: selection.period,
    method,
  });
}

async function post(
  fetcher: Fetcher,
  body: string,
  idempotencyKey: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  try {
    return await fetcher(CHECKOUT_API, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        ...extraHeaders,
      },
      body,
    });
  } catch {
    throw new CheckoutError('unavailable');
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CheckoutError('unavailable');
  }
}

/** Starts a Stripe Checkout session and returns the validated Stripe URL to send the visitor to. */
export async function startCardCheckout(
  selection: CheckoutSelection,
  idempotencyKey: string,
  fetcher: Fetcher = fetch,
): Promise<{ checkoutId: string; checkoutUrl: string }> {
  const response = await post(fetcher, requestBody(selection, 'card'), idempotencyKey);
  if (!response.ok) throw errorForStatus(response.status);
  const parsed = cardStartSchema.safeParse(await readJson(response));
  if (!parsed.success) throw new CheckoutError('unavailable');
  return { checkoutId: parsed.data.checkoutId, checkoutUrl: parsed.data.checkoutUrl };
}

/**
 * Crypto checkout: the server answers 402 with the exact USDC payment requirement; the wallet signs
 * it and the same request (same idempotency key) is sent again with the payment signature.
 */
export async function startCryptoCheckout(
  selection: CheckoutSelection,
  idempotencyKey: string,
  signPayment: (requirement: Response) => Promise<Record<string, string>>,
  fetcher: Fetcher = fetch,
): Promise<{ checkoutId: string }> {
  const body = requestBody(selection, 'crypto');
  const initial = await post(fetcher, body, idempotencyKey);
  if (initial.status !== 402) {
    // A paid checkout is never expected without a payment signature.
    throw errorForStatus(initial.ok ? 500 : initial.status);
  }
  const paymentHeaders = await signPayment(initial);
  const final = await post(fetcher, body, idempotencyKey, paymentHeaders);
  if (!final.ok) throw errorForStatus(final.status);
  const parsed = cryptoStartSchema.safeParse(await readJson(final));
  if (!parsed.success) throw new CheckoutError('unavailable');
  return { checkoutId: parsed.data.checkoutId };
}

/** Reads a checkout's status from the server; the return page trusts nothing else. */
export async function getCheckoutStatus(
  checkoutId: string,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<CheckoutStatusResult> {
  if (!isCheckoutId(checkoutId)) throw new CheckoutError('invalid');
  let response: Response;
  try {
    response = await fetcher(`${CHECKOUT_API}/${encodeURIComponent(checkoutId)}`, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new CheckoutError('unavailable');
  }
  // An unknown checkout is final: the page says so instead of waiting.
  if (response.status === 404) throw new CheckoutError('invalid');
  if (!response.ok) throw errorForStatus(response.status);
  const parsed = checkoutStatusSchema.safeParse(await readJson(response));
  if (!parsed.success || parsed.data.checkoutId !== checkoutId) {
    throw new CheckoutError('unavailable');
  }
  return parsed.data;
}
