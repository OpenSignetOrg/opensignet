'use client';

import { useEffect, useState } from 'react';
import { createSignInClient } from '@/lib/sign-in-client';
import type { Account } from '@/lib/sign-in-contract';

export type AccountSessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | {
      status: 'signed-in';
      account: Account;
      /** The wallets this account pays from (lower-case): its OpenSignet wallet and a linked one. */
      wallets: string[];
    };

export const SESSION_CHANGED_EVENT = 'opensignet:session-changed';

/**
 * The account session, whatever method was used to sign in (Google, email code or wallet).
 * A failed background check reads as signed out and never shows an error on its own.
 */
export function useAccountSession(): AccountSessionState {
  const [state, setState] = useState<AccountSessionState>({ status: 'loading' });

  useEffect(() => {
    const client = createSignInClient();
    let controller: AbortController | null = null;
    const refresh = () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      client
        .session(current.signal)
        .then((session) => {
          if (current.signal.aborted) return;
          setState(
            session.authenticated
              ? {
                  status: 'signed-in',
                  account: session.account,
                  wallets: (session.wallets ?? []).map((wallet) => wallet.toLowerCase()),
                }
              : { status: 'signed-out' },
          );
        })
        .catch(() => {
          if (!current.signal.aborted) setState({ status: 'signed-out' });
        });
    };
    refresh();
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    return () => {
      controller?.abort();
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
    };
  }, []);

  return state;
}
