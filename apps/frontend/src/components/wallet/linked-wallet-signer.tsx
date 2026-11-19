'use client';

import { useState } from 'react';
import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { WalletList } from '@/components/wallet/wallet-list';
import { AccountError } from '@/lib/account-client';
import { shortAddress } from '@/lib/utils';

/**
 * Signs `message` with the account's linked wallet `expected`, connecting it first if needed.
 * Anything signed here is checked again by the wallet vault, so this is only the signing step.
 */
export function LinkedWalletSigner({
  expected,
  message,
  browserCheck,
  onSigned,
  onBusy,
}: {
  expected: string;
  message: string;
  browserCheck?: string | null;
  onSigned: (signature: string) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const { address, isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = Boolean(address && address.toLowerCase() === expected.toLowerCase());

  async function sign() {
    if (!address || !matches) return;
    setSigning(true);
    onBusy(true);
    setError(null);
    try {
      const signature = await signMessageAsync({ account: address, message });
      await onSigned(signature);
    } catch (failure) {
      setError(
        failure instanceof AccountError
          ? failure.message
          : 'The signature wasn’t completed. Try again from your wallet.',
      );
    } finally {
      setSigning(false);
      onBusy(false);
    }
  }

  if (!isConnected || !address) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted-foreground">
          Connect your linked wallet{' '}
          <span className="font-mono text-foreground">{shortAddress(expected)}</span>.
        </p>
        <WalletList />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {browserCheck && (
        <div className="rounded-xl border border-border/80 bg-background/50 px-3.5 py-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Browser check
          </div>
          <div className="mt-1 font-mono text-base font-semibold tracking-wider">
            {browserCheck}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Your wallet’s request must show the same check as the wallet window.
          </p>
        </div>
      )}
      <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/50 px-3.5 py-3">
        <span
          className={
            matches
              ? 'h-2 w-2 rounded-full bg-[hsl(var(--brand-emerald))]'
              : 'h-2 w-2 rounded-full bg-destructive'
          }
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{shortAddress(address)}</span>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => void disconnectAsync().catch(() => undefined)}
          disabled={signing}
        >
          Use another wallet
        </button>
      </div>
      {!matches && (
        <InlineNotice tone="warning">
          This isn’t your linked wallet. Switch to {shortAddress(expected)} to approve.
        </InlineNotice>
      )}
      {error && <InlineNotice>{error}</InlineNotice>}
      <Button
        type="button"
        className="h-11 w-full"
        disabled={!matches || signing}
        onClick={() => void sign()}
      >
        {signing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {signing ? 'Confirm in your wallet' : 'Sign to approve'}
      </Button>
    </div>
  );
}
