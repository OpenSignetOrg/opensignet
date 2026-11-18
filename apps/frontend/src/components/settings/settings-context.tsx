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
import { AccountError, createAccountClient, type AccountClient } from '@/lib/account-client';
import type { AccountSettings } from '@/lib/account-contract';
import { SESSION_CHANGED_EVENT } from '@/hooks/use-account-session';

type SettingsState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; account: AccountSettings };

interface SettingsContextValue {
  client: AccountClient;
  account: AccountSettings;
  /** Replace the account with the server's latest copy after a change. */
  update: (account: AccountSettings) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}

/**
 * Loads the account once for every settings tab. Signed-out visitors go to sign-in and come back
 * to the tab they asked for.
 */
export function SettingsProvider({
  children,
  loading,
  unavailable,
}: {
  children: ReactNode;
  loading: ReactNode;
  unavailable: (message: string, retry: () => void) => ReactNode;
}) {
  const client = useMemo(() => createAccountClient(), []);
  const [state, setState] = useState<SettingsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    client
      .get(controller.signal)
      .then((account) => setState({ status: 'ready', account }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof AccountError && error.code === 'unauthenticated') {
          const here = `${window.location.pathname}${window.location.search}`;
          window.location.replace(`/sign-in?return_to=${encodeURIComponent(here)}`);
          return;
        }
        setState({
          status: 'unavailable',
          message:
            error instanceof AccountError
              ? error.message
              : 'Settings are temporarily unavailable. Try again in a moment.',
        });
      });
    return () => controller.abort();
  }, [client, attempt]);

  const update = useCallback((account: AccountSettings) => {
    setState({ status: 'ready', account });
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }, []);

  if (state.status === 'loading') return <>{loading}</>;
  if (state.status === 'unavailable')
    return <>{unavailable(state.message, () => setAttempt((value) => value + 1))}</>;
  return (
    <SettingsContext.Provider value={{ client, account: state.account, update }}>
      {children}
    </SettingsContext.Provider>
  );
}
