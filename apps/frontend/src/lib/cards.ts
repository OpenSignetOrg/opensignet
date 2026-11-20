import { z } from 'zod';
import { STRIPE_CHECKOUT_ORIGIN } from '@/lib/checkout';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';

/**
 * Saved cards. A card is entered only on Stripe's own page (while buying a plan by card, or with
 * Add card); OpenSignet keeps the brand, last four digits and expiry. The default card pays plan
 * and domain renewals that are set to renew by card.
 *
 *   GET    /api/v1/billing/cards              -> SavedCards
 *   POST   /api/v1/billing/cards              -> { checkoutUrl }  (Stripe's add-card page)
 *   POST   /api/v1/billing/cards/:id/default  -> SavedCards
 *   DELETE /api/v1/billing/cards/:id          -> SavedCards
 */
const cardSchema = z
  .object({
    id: z.string().uuid(),
    brand: z.string().max(40),
    last4: z.string().regex(/^\d{4}$/),
    expMonth: z.number().int().min(1).max(12),
    expYear: z.number().int(),
    isDefault: z.boolean(),
  })
  .strict();
export type SavedCard = z.infer<typeof cardSchema>;

const cardsSchema = z.object({ items: z.array(cardSchema), available: z.boolean() }).strict();
export type SavedCards = z.infer<typeof cardsSchema>;

export class CardError extends Error {}

const BRANDS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  cartes_bancaires: 'Cartes Bancaires',
};

export function brandName(brand: string): string {
  return BRANDS[brand] ?? 'Card';
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/billing/cards${path}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      ...init,
    });
  } catch {
    throw new CardError('Check your connection and try again. Nothing has changed.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CardError(
      response.status === 401
        ? 'Your sign-in has ended. Sign in again to continue.'
        : body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : 'Cards can’t be changed right now. Nothing has changed; try again in a moment.',
    );
  }
  return body;
}

function parsed(body: unknown): SavedCards {
  const result = cardsSchema.safeParse(body);
  if (!result.success) throw new CardError('Your cards couldn’t be loaded. Try again in a moment.');
  return result.data;
}

export const listCards = async (): Promise<SavedCards> => parsed(await request(''));

export const makeDefaultCard = async (id: string): Promise<SavedCards> =>
  parsed(await request(`/${encodeURIComponent(id)}/default`, { method: 'POST' }));

export const removeCard = async (id: string): Promise<SavedCards> =>
  parsed(await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' }));

/** The URL of Stripe's add-card page; only Stripe's own origin is accepted. */
export async function addCardUrl(): Promise<string> {
  const body = await request('', { method: 'POST' });
  const url =
    body &&
    typeof body === 'object' &&
    'checkoutUrl' in body &&
    typeof body.checkoutUrl === 'string'
      ? body.checkoutUrl
      : '';
  try {
    if (new URL(url).origin === STRIPE_CHECKOUT_ORIGIN) return url;
  } catch {
    // fall through
  }
  throw new CardError('Stripe’s page couldn’t be opened. Nothing has changed; try again.');
}
