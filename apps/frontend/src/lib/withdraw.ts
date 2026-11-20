import { z } from 'zod';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';

/**
 * Withdrawals from the OpenSignet wallet: USDC sent on Base to an address the owner chose, after
 * an approval with an email code or the linked wallet (started with
 * `createAccountClient().startWithdrawal`). OpenSignet pays the network fee.
 *
 *   POST /api/v1/wallet/withdrawals { challengeId } -> Withdrawal
 */
const withdrawalSchema = z
  .object({
    status: z.enum(['confirmed', 'submitted']),
    txHash: z.string().min(1).max(100),
    txUrl: z.string().startsWith('https://basescan.org/tx/'),
  })
  .strict();
export type Withdrawal = z.infer<typeof withdrawalSchema>;

export class WithdrawError extends Error {}

export async function completeWithdrawal(challengeId: string): Promise<Withdrawal> {
  let response: Response;
  try {
    response = await fetch('/api/v1/wallet/withdrawals', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS * 2),
    });
  } catch {
    throw new WithdrawError(
      'We couldn’t confirm the withdrawal. Check your balance before trying again.',
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WithdrawError(
      response.status === 401
        ? 'Your sign-in has ended. Sign in again to continue.'
        : body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : 'The withdrawal couldn’t be sent right now. Nothing was sent; try again in a moment.',
    );
  }
  const parsed = withdrawalSchema.safeParse(body);
  if (!parsed.success) {
    throw new WithdrawError(
      'We couldn’t confirm the withdrawal. Check your balance before trying again.',
    );
  }
  return parsed.data;
}

/** "12.5" → 12500000n (USDC has 6 decimals); null when it isn't a positive amount. */
export function usdcToAtomic(text: string): bigint | null {
  const value = text.trim().replace(/,/g, '');
  const match = /^(\d{1,12})(?:\.(\d{0,6}))?$/.exec(value);
  if (!match) return null;
  const atomic = BigInt(match[1] ?? '0') * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'));
  return atomic > 0n ? atomic : null;
}
