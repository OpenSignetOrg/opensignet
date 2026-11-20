'use client';

import { useSyncExternalStore } from 'react';
import { renewalItemSchema } from '@/lib/auto-renew';
import { createAccountClient } from '@/lib/account-client';
import { RegistrationSubmissionError } from '@/lib/registration-submission';

/**
 * Who pays for a registration made on the register page: the account's own OpenSignet wallet
 * (no code; the vault only pays OpenSignet) or another wallet the person connects and has linked
 * to the account (an x402 payment signed in that wallet). The registration updates follow the
 * same payer.
 */
export type RegistrationPayerMethod = 'wallet' | 'crypto';

export interface RegistrationPayerState {
  method: RegistrationPayerMethod;
  /** The account's OpenSignet wallet, when signed in and set up. */
  embedded: string | null;
  /** The wallet connected in this browser, if any. */
  connected: string | null;
}

const STORAGE_KEY = 'opensignet:registration-payer';
const listeners = new Set<() => void>();
let state: RegistrationPayerState = { method: 'wallet', embedded: null, connected: null };
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === 'crypto')
      state = { ...state, method: 'crypto' };
  } catch {
    /* A remembered choice is a convenience; the OpenSignet wallet stays the default. */
  }
}

export const registrationPayer = {
  get(): RegistrationPayerState {
    hydrate();
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  update(patch: Partial<RegistrationPayerState>) {
    hydrate();
    const next = { ...state, ...patch };
    if (
      next.method === state.method &&
      next.embedded === state.embedded &&
      next.connected === state.connected
    )
      return;
    state = next;
    if (patch.method) {
      try {
        window.localStorage.setItem(STORAGE_KEY, patch.method);
      } catch {
        /* See hydrate. */
      }
    }
    for (const listener of listeners) listener();
  },
  /** The paying wallet (lower-case) for the chosen method, or null when there is none yet. */
  payer(): string | null {
    const current = registrationPayer.get();
    const address = current.method === 'wallet' ? current.embedded : current.connected;
    return address ? address.toLowerCase() : null;
  },
};

const serverSnapshot: RegistrationPayerState = {
  method: 'wallet',
  embedded: null,
  connected: null,
};

export function useRegistrationPayer(): RegistrationPayerState {
  return useSyncExternalStore(
    registrationPayer.subscribe,
    registrationPayer.get,
    () => serverSnapshot,
  );
}

interface Requirement {
  amount: string;
  payTo: string;
  extra: { requestBinding: string; quoteExpiresAt: string };
}

function isRequirement(value: unknown): value is Requirement {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const extra = item.extra as Record<string, unknown> | undefined;
  return (
    typeof item.amount === 'string' &&
    /^\d{1,30}$/.test(item.amount) &&
    typeof item.payTo === 'string' &&
    /^0x[\da-fA-F]{40}$/.test(item.payTo) &&
    typeof extra?.requestBinding === 'string' &&
    /^0x[\da-f]{64}$/.test(extra.requestBinding) &&
    typeof extra.quoteExpiresAt === 'string'
  );
}

/**
 * The x402 payment for a priced registration, paid from the OpenSignet wallet: the vault signs the
 * exact transfer the server priced (and, when the server offers it, lets the domain renew from the
 * wallet), and the payment header carries that signature.
 */
export async function createWalletPaymentHeaders(
  response: Response,
  payer: string,
  summary: string,
): Promise<Record<string, string>> {
  const encoded = response.headers.get('PAYMENT-REQUIRED');
  if (!encoded) throw new RegistrationSubmissionError('INVALID_PAYMENT_REQUIREMENT');
  let accepted: unknown;
  try {
    accepted = (JSON.parse(atob(encoded)) as { accepts?: unknown[] }).accepts?.[0];
  } catch {
    throw new RegistrationSubmissionError('INVALID_PAYMENT_REQUIREMENT');
  }
  if (!isRequirement(accepted))
    throw new RegistrationSubmissionError('INVALID_PAYMENT_REQUIREMENT');
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { walletRenews?: unknown } | null;
  const renews = renewalItemSchema.safeParse(body?.walletRenews);
  const now = Math.floor(Date.now() / 1000);
  const expires = Math.floor(Date.parse(accepted.extra.quoteExpiresAt) / 1000);
  const validBefore = String(Math.min(now + 600, expires + 60));
  const signature = await createAccountClient().payFromWallet({
    to: accepted.payTo,
    value: accepted.amount,
    validBefore,
    nonce: accepted.extra.requestBinding,
    summary,
    ...(renews.success ? { renews: renews.data } : {}),
  });
  const payment = {
    x402Version: 2,
    accepted,
    payload: {
      authorization: {
        from: payer,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: '0',
        validBefore,
        nonce: accepted.extra.requestBinding,
      },
      signature,
    },
  };
  return { 'PAYMENT-SIGNATURE': btoa(JSON.stringify(payment)) };
}
