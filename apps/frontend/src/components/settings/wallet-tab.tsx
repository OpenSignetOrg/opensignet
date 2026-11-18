'use client';

import { useId, useRef, useState } from 'react';
import { base } from 'wagmi/chains';
import type { Address } from 'viem';
import {
  Check,
  Copy,
  Fingerprint,
  KeyRound,
  LifeBuoy,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { AccountError, type WalletWindowPurpose } from '@/lib/account-client';
import { openWalletWindow, WalletWindowError } from '@/lib/wallet-window';
import { formatUsd } from '@/lib/utils';
import { useSettings } from './settings-context';
import { SettingsCard } from './settings-ui';
import { StepUpCancelled, useStepUp } from './step-up';

type WalletWindow = ReturnType<typeof useWalletWindow>;

/**
 * Opens the wallet window for one purpose at a time and keeps the page in step with what it
 * reports. Errors stay beside the button that caused them.
 */
function useWalletWindow() {
  const { client, update } = useSettings();
  const [pending, setPending] = useState<WalletWindowPurpose | null>(null);
  const [error, setError] = useState<{ purpose: WalletWindowPurpose; message: string } | null>(
    null,
  );

  // Only the latest request may clear the pending state; an earlier window can still be open.
  const latest = useRef(0);

  /** `token` is passed when it had to be fetched earlier (after an approval). */
  async function open(purpose: WalletWindowPurpose, token?: string) {
    const request = ++latest.current;
    const settle = () => {
      if (latest.current === request) setPending(null);
    };
    setPending(purpose);
    setError(null);
    try {
      await openWalletWindow(
        purpose,
        () => (token ? Promise.resolve(token) : client.walletWindowToken(purpose)),
        (result) => {
          // Done as soon as the window reports, even while it stays open to show its result.
          settle();
          if (result === 'created') toast.success('Your wallet is ready');
          if (result === 'passkey_added') toast.success('Backup passkey added');
          if (result === 'recovery_kit_created') toast.success('Recovery kit saved');
          if (result === 'recovered') toast.success('Your wallet is recovered');
          client
            .get()
            .then(update)
            .catch(() => undefined);
        },
      );
    } catch (failure) {
      setError({
        purpose,
        message:
          failure instanceof WalletWindowError
            ? failure.reason === 'blocked'
              ? 'Your browser blocked the wallet window. Allow pop-ups for this site and try again.'
              : 'The wallet window isn’t available right now. Try again in a moment.'
            : failure instanceof AccountError
              ? failure.message
              : new AccountError('unavailable').message,
      });
    } finally {
      settle();
    }
  }

  return {
    open,
    pending,
    errorFor: (purpose: WalletWindowPurpose) => (error?.purpose === purpose ? error.message : null),
  };
}

export function WalletTab() {
  const { account } = useSettings();
  const walletWindow = useWalletWindow();
  const wallet = account.embeddedWallet;
  if (!wallet) return <SetupCard walletWindow={walletWindow} />;
  return (
    <>
      <WalletCard address={wallet.address as Address} />
      <PasskeysCard count={wallet.passkeys} walletWindow={walletWindow} />
      <RecoveryCard hasKit={wallet.recoveryKit} walletWindow={walletWindow} />
      <ExportCard walletWindow={walletWindow} />
    </>
  );
}

function PendingLabel({ children }: { children: string }) {
  return (
    <>
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
      {children}
    </>
  );
}

function SetupCard({ walletWindow }: { walletWindow: WalletWindow }) {
  const pending = walletWindow.pending === 'setup';
  const error = walletWindow.errorFor('setup');
  return (
    <SettingsCard
      id="wallet"
      title="Create your OpenSignet wallet"
      description="Your own wallet on Base for payments and credits. It’s created on your device and locked with a passkey, so only you can use it."
      footer={
        <>
          <p className="text-xs text-muted-foreground">Opens a secure OpenSignet window.</p>
          <Button
            type="button"
            size="sm"
            className="h-9 w-full sm:w-auto"
            disabled={walletWindow.pending !== null}
            aria-busy={pending || undefined}
            onClick={() => void walletWindow.open('setup')}
          >
            {pending ? (
              <PendingLabel>Continue in the wallet window</PendingLabel>
            ) : (
              <>
                <Wallet className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Create wallet
              </>
            )}
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-2.5 text-sm leading-6 text-muted-foreground">
        {[
          'Self-custodial: OpenSignet keeps only a locked copy it can’t open.',
          'Approve payments and exports with your fingerprint, face or device PIN.',
          'Export the key whenever you like and use it in any wallet app.',
        ].map((line) => (
          <li key={line} className="flex gap-2.5">
            <span
              className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-orange))]"
              aria-hidden
            />
            {line}
          </li>
        ))}
      </ul>
      {error && <InlineNotice className="mt-4">{error}</InlineNotice>}
    </SettingsCard>
  );
}

function WalletCard({ address }: { address: Address }) {
  const { balanceNumber, isLoading } = useUsdcBalance(address, base.id);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Couldn’t copy the address. Select it and copy it instead.');
    }
  }

  return (
    <SettingsCard
      id="wallet"
      title="OpenSignet wallet"
      description="Your own wallet on Base. Only your passkeys can approve payments or exports from it."
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Address
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 truncate rounded-md bg-secondary/70 px-2.5 py-1.5 font-mono text-[13px]">
              {address}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => void copy()}
              aria-label={copied ? 'Address copied' : 'Copy address'}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Network: Base</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-background/50 px-4 py-3 sm:min-w-[180px] sm:text-right">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Balance
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {isLoading ? (
              <span className="inline-block h-6 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            ) : (
              <>
                {formatUsd(balanceNumber).slice(1)}{' '}
                <span className="text-sm font-medium text-muted-foreground">USDC</span>
              </>
            )}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

function PasskeysCard({ count, walletWindow }: { count: number; walletWindow: WalletWindow }) {
  const pending = walletWindow.pending === 'add_passkey';
  const error = walletWindow.errorFor('add_passkey');
  return (
    <SettingsCard
      id="passkeys"
      title="Passkeys"
      description="Passkeys unlock your wallet. Keep a backup on a second device, such as your phone or a security key."
      footer={
        <>
          <p className="text-xs text-muted-foreground">
            {count === 1 ? '1 passkey' : `${count} passkeys`} can unlock this wallet.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full sm:w-auto"
            disabled={walletWindow.pending !== null}
            aria-busy={pending || undefined}
            onClick={() => void walletWindow.open('add_passkey')}
          >
            {pending ? (
              <PendingLabel>Continue in the wallet window</PendingLabel>
            ) : (
              <>
                <Fingerprint className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Add backup passkey
              </>
            )}
          </Button>
        </>
      }
    >
      {count <= 1 && (
        <InlineNotice tone="warning">
          Your wallet has one passkey. If you lose it, the wallet can’t be recovered. Add a backup.
        </InlineNotice>
      )}
      {error && <InlineNotice className={count <= 1 ? 'mt-3' : undefined}>{error}</InlineNotice>}
    </SettingsCard>
  );
}

function RecoveryCard({ hasKit, walletWindow }: { hasKit: boolean; walletWindow: WalletWindow }) {
  const pending = walletWindow.pending === 'recovery_kit';
  const error = walletWindow.errorFor('recovery_kit');
  const [recovering, setRecovering] = useState(false);
  return (
    <SettingsCard
      id="recovery"
      title="Recovery kit"
      description="A recovery code that restores your wallet if you lose every passkey. Keep it offline, such as printed or in a password manager."
      footer={
        <>
          {hasKit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-center sm:w-auto"
              disabled={walletWindow.pending !== null}
              onClick={() => setRecovering(true)}
            >
              <LifeBuoy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Lost your passkeys?
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Unlocked with your passkey to create.</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full sm:w-auto"
            disabled={walletWindow.pending !== null}
            aria-busy={pending || undefined}
            onClick={() => void walletWindow.open('recovery_kit')}
          >
            {pending ? (
              <PendingLabel>Continue in the wallet window</PendingLabel>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {hasKit ? 'Replace recovery kit' : 'Create recovery kit'}
              </>
            )}
          </Button>
        </>
      }
    >
      {hasKit ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 shrink-0 text-[hsl(146_45%_30%)]" aria-hidden />
          Your recovery kit is saved. Replacing it makes the old code stop working.
        </p>
      ) : (
        <InlineNotice tone="warning">
          You don’t have a recovery kit yet. Without one, losing all your passkeys means losing your
          wallet.
        </InlineNotice>
      )}
      {error && <InlineNotice className="mt-3">{error}</InlineNotice>}
      {recovering && (
        <RecoverDialog walletWindow={walletWindow} onClose={() => setRecovering(false)} />
      )}
    </SettingsCard>
  );
}

/**
 * Recovery needs a fresh approval with the sign-in method first. The wallet window then opens on
 * a second click, because browsers only allow pop-ups that come straight from a click.
 */
function RecoverDialog({
  walletWindow,
  onClose,
}: {
  walletWindow: WalletWindow;
  onClose: () => void;
}) {
  const { client } = useSettings();
  const { run } = useStepUp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      setToken(await run(() => client.walletWindowToken('recover')));
    } catch (failure) {
      if (!(failure instanceof StepUpCancelled))
        setError(
          failure instanceof AccountError
            ? failure.message
            : new AccountError('unavailable').message,
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Recover your wallet"
      description="Use this only if you no longer have any of your wallet’s passkeys."
      onClose={onClose}
      busy={busy}
    >
      <ol className="flex flex-col gap-2.5 text-sm leading-6 text-muted-foreground">
        {[
          'Approve with your sign-in method.',
          'Enter the code from your recovery kit in the secure wallet window.',
          'Create a new passkey. Your wallet and its funds stay the same.',
        ].map((line, index) => (
          <li key={line} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/80 text-[11px] font-semibold text-foreground">
              {index + 1}
            </span>
            {line}
          </li>
        ))}
      </ol>
      {error && <InlineNotice className="mt-4">{error}</InlineNotice>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {token ? (
          <Button
            type="button"
            onClick={() => {
              onClose();
              void walletWindow.open('recover', token);
            }}
          >
            Open wallet window
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => void approve()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Continue
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function ExportCard({ walletWindow }: { walletWindow: WalletWindow }) {
  const [open, setOpen] = useState(false);
  const pending = walletWindow.pending === 'export';
  const error = walletWindow.errorFor('export');
  return (
    <SettingsCard
      id="export"
      title="Export private key"
      description="Take your wallet anywhere by importing the key into another wallet app. Connecting that wallet to OpenSignet later still opens this same account."
      footer={
        <>
          <p className="text-xs text-muted-foreground">Approved with your passkey each time.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full sm:w-auto"
            disabled={walletWindow.pending !== null}
            aria-busy={pending || undefined}
            onClick={() => setOpen(true)}
          >
            {pending ? (
              <PendingLabel>Continue in the wallet window</PendingLabel>
            ) : (
              <>
                <KeyRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Export private key
              </>
            )}
          </Button>
        </>
      }
    >
      {error && <InlineNotice>{error}</InlineNotice>}
      {open && (
        <ExportDialog
          onClose={() => setOpen(false)}
          onContinue={() => {
            setOpen(false);
            void walletWindow.open('export');
          }}
        />
      )}
    </SettingsCard>
  );
}

function ExportDialog({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  const ackId = useId();
  const [understood, setUnderstood] = useState(false);

  return (
    <Dialog
      title="Export your private key"
      description="Anyone who has this key controls your wallet and its funds."
      onClose={onClose}
    >
      <ul className="flex flex-col gap-2.5 text-sm leading-6 text-muted-foreground">
        {[
          'Never share it with anyone, including OpenSignet. We will never ask for it.',
          'Store it offline, such as in a password manager. Don’t screenshot it.',
          'It’s shown in a separate secure window after you unlock it with your passkey. This page never sees it.',
        ].map((line) => (
          <li key={line} className="flex gap-2.5">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand-orange))]"
              strokeWidth={1.75}
              aria-hidden
            />
            {line}
          </li>
        ))}
      </ul>
      <label
        htmlFor={ackId}
        className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 bg-background/50 px-3.5 py-3 text-sm"
      >
        <input
          id={ackId}
          type="checkbox"
          checked={understood}
          onChange={(event) => setUnderstood(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        I understand that anyone with this key can take my funds.
      </label>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!understood} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </Dialog>
  );
}
