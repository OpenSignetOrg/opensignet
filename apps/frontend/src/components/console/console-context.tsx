'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useAccountSession } from '@/hooks/use-account-session';
import { createAccountClient } from '@/lib/account-client';
import type { AccountSettings } from '@/lib/account-contract';
import { REGISTRATION_CHANGED_EVENT } from '@/lib/registration-progress';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';

/** One identity as the account's lists show it. */
export interface ConsoleIdentity {
  id: string;
  domain: string;
  basename: string | null;
  ensName: string | null;
  /** The identity's OpenSignet Pass token, or null until it is minted. */
  passTokenId: number | null;
  status: string;
  framework: string | null;
  createdAt: string;
  expiresAt: string | null;
  /** Pinned to the top of the lists. */
  pinned: boolean;
}

export type IdentitiesState =
  { status: 'loading' } | { status: 'ready'; items: ConsoleIdentity[] } | { status: 'error' };

export type ConsoleState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** Signed in, in the moments after sign-up while the account's wallet is created. */
  | { status: 'wallet-pending' }
  | { status: 'unavailable' }
  | { status: 'ready'; account: AccountSettings };

interface ConsoleValue {
  state: ConsoleState;
  identities: IdentitiesState;
  /** Loads the account and its identities again. */
  refresh: () => void;
  /** Saves a new order (and pins) for the identities; shown at once, undone if it can't be saved. */
  arrange: (items: ConsoleIdentity[]) => void;
}

const ConsoleContext = createContext<ConsoleValue | null>(null);

export function useConsole(): ConsoleValue {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error('useConsole must be used inside ConsoleProvider');
  return value;
}

/** The ready account; only for components rendered after the shell checked the state. */
export function useConsoleAccount(): AccountSettings {
  const { state } = useConsole();
  if (state.status !== 'ready') throw new Error('The account is not loaded');
  return state.account;
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  provisioning: 'Setting up',
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  failed: 'Failed',
};

/**
 * Everything the signed-in console shares: the account (name, email, OpenSignet wallet) and its
 * identities, loaded once for the sidebar and every page.
 */
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const session = useAccountSession();
  const [account, setAccount] = useState<AccountSettings | 'loading' | 'wallet-pending' | 'error'>(
    'loading',
  );
  const [identities, setIdentities] = useState<IdentitiesState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    window.addEventListener(REGISTRATION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(REGISTRATION_CHANGED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (session.status !== 'signed-in') return;
    const controller = new AbortController();
    createAccountClient()
      .get(controller.signal)
      .then((settings) => {
        if (controller.signal.aborted) return;
        setAccount(settings.embeddedWallet ? settings : 'wallet-pending');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setAccount((current) => (current === 'loading' ? 'error' : current));
      });
    return () => controller.abort();
  }, [session.status, revision]);

  // The wallet is created right after sign-up; check again until it exists.
  useEffect(() => {
    if (account !== 'wallet-pending') return;
    const timer = window.setTimeout(refresh, 1500);
    return () => window.clearTimeout(timer);
  }, [account, revision, refresh]);

  const wallet = typeof account === 'object' ? account.embeddedWallet?.address : undefined;
  useEffect(() => {
    if (!wallet) return;
    const controller = new AbortController();
    fetch(`/api/v1/agents/by-wallet/${wallet}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('identities unavailable');
        const items = (await response.json()) as unknown;
        if (!Array.isArray(items)) throw new Error('identities unavailable');
        if (!controller.signal.aborted) {
          setIdentities({
            status: 'ready',
            items: (items as ConsoleIdentity[]).map((item) => ({
              ...item,
              pinned: item.pinned === true,
            })),
          });
        }
      })
      .catch(() => {
        // Keep a list we already have; only a first load shows the error.
        if (!controller.signal.aborted) {
          setIdentities((current) => (current.status === 'ready' ? current : { status: 'error' }));
        }
      });
    return () => controller.abort();
  }, [wallet, revision]);

  const state = useMemo<ConsoleState>(
    () =>
      session.status === 'loading'
        ? { status: 'loading' }
        : session.status === 'signed-out'
          ? { status: 'signed-out' }
          : account === 'loading'
            ? { status: 'loading' }
            : account === 'wallet-pending'
              ? { status: 'wallet-pending' }
              : account === 'error'
                ? { status: 'unavailable' }
                : { status: 'ready', account },
    [session.status, account],
  );

  const arrange = useCallback((items: ConsoleIdentity[]) => {
    let previous: IdentitiesState | null = null;
    setIdentities((current) => {
      previous = current;
      return { status: 'ready', items };
    });
    fetch('/api/v1/agents/arrangement', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: items.map((item) => item.id),
        pinned: items.filter((item) => item.pinned).map((item) => item.id),
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
      .then((response) => {
        if (!response.ok) throw new Error('not saved');
      })
      .catch(() => {
        if (previous) setIdentities(previous);
        toast.error('Couldn’t save the order', {
          description: 'Your identities are back as they were. Try again in a moment.',
        });
      });
  }, []);

  const value = useMemo(
    () => ({ state, identities, refresh, arrange }),
    [state, identities, refresh, arrange],
  );
  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}
