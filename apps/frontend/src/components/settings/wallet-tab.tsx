'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { base } from 'wagmi/chains';
import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import type { Address } from 'viem';
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { CodeInput } from '@/components/sign-in/code-input';
import { WalletList } from '@/components/wallet/wallet-list';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { AccountError } from '@/lib/account-client';
import type { EmbeddedWallet, VaultChallenge, WalletApprover } from '@/lib/account-contract';
import { EMAIL_CODE_LENGTH } from '@/lib/sign-in-contract';
import { sealProof } from '@/lib/vault-seal';
import { openWalletWindow, WalletWindowError, type SignRequest } from '@/lib/wallet-window';
import { formatUsd, shortAddress } from '@/lib/utils';
import { useSettings } from './settings-context';
import { SettingsCard } from './settings-ui';

function failureMessage(failure: unknown): string {
  return failure instanceof AccountError
    ? failure.message
    : new AccountError('unavailable').message;
}

export function WalletTab() {
  const { account } = useSettings();
  const wallet = account.embeddedWallet;
  if (!wallet) return <SettingUpCard />;
  return (
    <>
      <WalletCard address={wallet.address as Address} />
      <ApproversCard wallet={wallet} />
      <ExportCard />
    </>
  );
}

/**
 * The wallet is created moments after the account. If the page opens in that moment, it waits
 * and refreshes on its own; nobody has to do anything.
 */
function SettingUpCard() {
  const { client, update } = useSettings();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    setFailed(false);
    const timer = window.setInterval(() => {
      tries += 1;
      client
        .get()
        .then((next) => {
          if (cancelled) return;
          if (next.embeddedWallet) update(next);
          else if (tries >= 20) setFailed(true);
        })
        .catch(() => {
          if (!cancelled && tries >= 20) setFailed(true);
        });
      if (tries >= 20) window.clearInterval(timer);
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, update, attempt]);

  return (
    <SettingsCard
      id="wallet"
      title="OpenSignet wallet"
      description="Every OpenSignet account comes with its own wallet on Base."
      footer={
        failed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full sm:ml-auto sm:w-auto"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Check again
          </Button>
        ) : undefined
      }
    >
      {failed ? (
        <InlineNotice>
          Your wallet is taking longer than usual to set up. It will appear here on its own; check
          again in a moment.
        </InlineNotice>
      ) : (
        <p role="status" className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Setting up your wallet…
        </p>
      )}
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
      description="Your account’s own wallet on Base. Nothing moves from it without your approval."
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
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Send USDC on Base to this address to pay with crypto and keep automatic renewals funded.
          </p>
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

function ApproverRow({ approver }: { approver: WalletApprover }) {
  const Icon = approver.kind === 'email' ? Mail : Wallet;
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl border border-border/80 bg-background/50 px-3.5 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
        {approver.kind === 'wallet' ? (
          <span className="font-mono">{shortAddress(approver.display)}</span>
        ) : (
          approver.display
        )}
      </span>
      <span className="hidden shrink-0 text-xs text-muted-foreground min-[400px]:inline">
        {approver.kind === 'email' ? 'Email code' : 'Wallet signature'}
      </span>
    </li>
  );
}

function ApproversCard({ wallet }: { wallet: EmbeddedWallet }) {
  const { account } = useSettings();
  const [open, setOpen] = useState(false);
  const outdated = wallet.approversInSync === false;
  const next = [
    account.email,
    account.externalWallet ? shortAddress(account.externalWallet.address) : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <SettingsCard
      id="approvals"
      title="Wallet approvals"
      description="Payments, exports and other wallet actions need an approval from one of these."
      footer={
        outdated && wallet.approvers ? (
          <>
            <p className="text-xs text-muted-foreground">
              Needs an approval from the current approvers.
            </p>
            <Button
              type="button"
              size="sm"
              className="h-9 w-full sm:w-auto"
              onClick={() => setOpen(true)}
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Confirm the change
            </Button>
          </>
        ) : undefined
      }
    >
      {wallet.approvers === null ? (
        <InlineNotice>
          Approval settings can’t be shown right now. Nothing has changed; try again in a moment.
        </InlineNotice>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {wallet.approvers.map((approver) => (
              <ApproverRow key={`${approver.kind}:${approver.display}`} approver={approver} />
            ))}
          </ul>
          {outdated && (
            <InlineNotice tone="warning" className="mt-3">
              Your sign-in email or linked wallet changed. Wallet approvals still go to the ones
              above until they confirm the change to {next.join(' and ')}.
            </InlineNotice>
          )}
        </>
      )}
      {open && wallet.approvers && (
        <ApproverChangeDialog approvers={wallet.approvers} onClose={() => setOpen(false)} />
      )}
    </SettingsCard>
  );
}

/** Signs `message` with the linked wallet `expected`, connecting it first if needed. */
function LinkedWalletSigner({
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

/**
 * Moves wallet approvals to the account's current email and linked wallet. The current
 * approvers must approve it, so a takeover of the email alone never reaches the wallet.
 */
function ApproverChangeDialog({
  approvers,
  onClose,
}: {
  approvers: WalletApprover[];
  onClose: () => void;
}) {
  const { client, update } = useSettings();
  const canEmail = approvers.some((approver) => approver.kind === 'email');
  const canWallet = approvers.some((approver) => approver.kind === 'wallet');
  const [factor, setFactor] = useState<'email' | 'wallet'>(canEmail ? 'email' : 'wallet');
  const [challenge, setChallenge] = useState<VaultChallenge | null>(null);
  const [starting, setStarting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountError | null>(null);
  const [code, setCode] = useState('');
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  const start = useCallback(
    async (chosen: 'email' | 'wallet') => {
      setStarting(true);
      setError(null);
      setCode('');
      setChallenge(null);
      try {
        setChallenge(await client.startApproverChange(chosen));
        if (chosen === 'email') window.setTimeout(() => input.current?.focus(), 0);
      } catch (failure) {
        setError(failure instanceof AccountError ? failure : new AccountError('unavailable'));
      } finally {
        setStarting(false);
      }
    },
    [client],
  );

  // One approval per chosen method: never send two codes for one change.
  const startedFor = useRef<'email' | 'wallet' | null>(null);
  useEffect(() => {
    if (startedFor.current === factor) return;
    startedFor.current = factor;
    void start(factor);
  }, [factor, start]);

  async function finish(proof: { code?: string; signature?: string }) {
    if (!challenge) return;
    const vaultKey = await client.vaultKey();
    const sealed = await sealProof(vaultKey, { challengeId: challenge.challengeId, ...proof });
    await client.completeApproval(challenge.challengeId, sealed);
    await client.applyApproverChange(challenge.challengeId);
    update(await client.get());
    toast.success('Wallet approvals updated');
    onClose();
  }

  async function verify(value: string) {
    if (value.length !== EMAIL_CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      await finish({ code: value });
    } catch (failure) {
      setError(failure instanceof AccountError ? failure : new AccountError('unavailable'));
      setCode('');
      window.setTimeout(() => input.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  const dead =
    error?.code === 'code_expired' ||
    error?.code === 'too_many_attempts' ||
    error?.code === 'approval_required';

  return (
    <Dialog
      title="Confirm the change"
      description={
        factor === 'email'
          ? 'Approve with a code sent to your current approval email.'
          : 'Approve by signing with your current approval wallet.'
      }
      onClose={onClose}
      busy={busy}
    >
      {starting ? (
        <p role="status" className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {factor === 'email' ? 'Sending a code…' : 'Preparing the approval…'}
        </p>
      ) : challenge && factor === 'email' ? (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            We sent a {EMAIL_CODE_LENGTH}-digit code to{' '}
            <span className="font-medium text-foreground">{challenge.sentTo}</span>.
          </p>
          <label htmlFor={inputId} className="sr-only">
            {EMAIL_CODE_LENGTH}-digit code
          </label>
          <CodeInput
            ref={input}
            id={inputId}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (error && !dead) setError(null);
            }}
            onComplete={(value) => void verify(value)}
            disabled={busy || dead}
            invalid={Boolean(error) && !dead}
          />
          {error && <InlineNotice className="mt-3">{error.message}</InlineNotice>}
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              className="h-11 w-full"
              disabled={busy || dead || code.length !== EMAIL_CODE_LENGTH}
              onClick={() => void verify(code)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {busy ? 'Checking code…' : 'Approve'}
            </Button>
            {dead && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full"
                onClick={() => void start('email')}
              >
                Send a new code
              </Button>
            )}
          </div>
        </div>
      ) : challenge && challenge.message ? (
        <LinkedWalletSigner
          expected={challenge.sentTo}
          message={challenge.message}
          onBusy={setBusy}
          onSigned={(signature) => finish({ signature })}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {error && <InlineNotice>{error.message}</InlineNotice>}
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            onClick={() => void start(factor)}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Try again
          </Button>
        </div>
      )}
      {canEmail && canWallet && !busy && (
        <button
          type="button"
          onClick={() => setFactor(factor === 'email' ? 'wallet' : 'email')}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {factor === 'email' ? (
            <>
              <Wallet className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Use my wallet instead
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Use an email code instead
            </>
          )}
        </button>
      )}
    </Dialog>
  );
}

interface PendingSignature {
  request: SignRequest;
  resolve: (signature: string) => void;
  reject: () => void;
}

function ExportCard() {
  const { client } = useSettings();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<PendingSignature | null>(null);

  async function open() {
    setConfirming(false);
    setPending(true);
    setError(null);
    try {
      await openWalletWindow(() => client.walletExportToken(), {
        onExported: () => setPending(false),
        onSignRequest: (request) =>
          new Promise<string>((resolve, reject) => setSignature({ request, resolve, reject })),
      });
    } catch (failure) {
      setError(
        failure instanceof WalletWindowError
          ? failure.reason === 'blocked'
            ? 'Your browser blocked the wallet window. Allow pop-ups for this site and try again.'
            : 'The wallet window isn’t available right now. Try again in a moment.'
          : failureMessage(failure),
      );
    } finally {
      setPending(false);
      setSignature((current) => {
        current?.reject();
        return null;
      });
    }
  }

  return (
    <SettingsCard
      id="export"
      title="Export private key"
      description="Take your wallet anywhere by importing the key into another wallet app. Connecting that wallet to OpenSignet later still opens this same account."
      footer={
        <>
          <p className="text-xs text-muted-foreground">
            Approved with an email code or your linked wallet.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full sm:w-auto"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() => setConfirming(true)}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Continue in the wallet window
              </>
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
      {confirming && (
        <ExportDialog onClose={() => setConfirming(false)} onContinue={() => void open()} />
      )}
      {signature && (
        <Dialog
          title="Approve the export in your wallet"
          description="The wallet window asked your linked wallet to sign this export."
          onClose={() => {
            signature.reject();
            setSignature(null);
          }}
        >
          <LinkedWalletSigner
            expected={signature.request.approver}
            message={signature.request.message}
            browserCheck={
              /Browser check: ([A-Z0-9-]+)/.exec(signature.request.message)?.[1] ?? null
            }
            onBusy={() => undefined}
            onSigned={async (signed) => {
              signature.resolve(signed);
              setSignature(null);
            }}
          />
        </Dialog>
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
          'It’s shown only in a separate secure window, after you approve. This page never sees it.',
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
