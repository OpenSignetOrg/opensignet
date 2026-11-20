'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { WagmiProvider, useConfig } from 'wagmi';
import { getAccount, watchAccount } from 'wagmi/actions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getWagmiConfig } from '@/lib/wagmi';
import {
  RegistrationTrackerProvider,
  useRegistrationTracker,
} from '@/components/register/registration-tracker-provider';
import { REGISTRATION_CHANGED_EVENT } from '@/lib/registration-progress';
import { DevDocsLinks } from '@/components/dev-docs-links';
import { useAccountSession } from '@/hooks/use-account-session';
import { createAccountClient } from '@/lib/account-client';
import { registrationPayer } from '@/lib/registration-payer';

/**
 * Top-level client providers. Mounted from the server layout via a client
 * boundary so we can use React hooks for query/wallet state.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [config] = useState(() => getWagmiConfig());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries();
    };
    window.addEventListener(REGISTRATION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(REGISTRATION_CHANGED_EVENT, refresh);
  }, [queryClient]);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RegistrationTrackerProvider>
          <RegistrationWalletBridge />
          <DevDocsLinks />
          {children}
        </RegistrationTrackerProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/** Keeps the registration updates on the wallet that pays: the OpenSignet wallet or a connected one. */
function RegistrationWalletBridge() {
  const config = useConfig();
  const tracker = useRegistrationTracker();
  const session = useAccountSession();
  const accountId = session.status === 'signed-in' ? session.account.id : null;

  useEffect(() => {
    const synchronize = (account: ReturnType<typeof getAccount>) => {
      registrationPayer.update({
        connected: account.status === 'connected' ? account.address : null,
      });
    };
    synchronize(getAccount(config));
    return watchAccount(config, { onChange: synchronize });
  }, [config]);

  useEffect(() => {
    if (!accountId) {
      registrationPayer.update({ embedded: null });
      return;
    }
    const controller = new AbortController();
    createAccountClient()
      .wallet(controller.signal)
      .then((wallet) => registrationPayer.update({ embedded: wallet?.address ?? null }))
      .catch(() => {
        /* Without the wallet the register page offers sign-in again or another wallet. */
      });
    return () => controller.abort();
  }, [accountId]);

  useEffect(() => {
    const follow = () => tracker.setExpectedWallet(registrationPayer.payer());
    follow();
    return registrationPayer.subscribe(follow);
  }, [tracker]);
  return null;
}
