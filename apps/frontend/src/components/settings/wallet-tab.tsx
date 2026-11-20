'use client';

import { useEffect, useId, useState } from 'react';
import { base } from 'wagmi/chains';
import type { Address } from 'viem';
import {
  ArrowUpRight,
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
import { LinkedWalletSigner } from '@/components/wallet/linked-wallet-signer';
import { VaultApprovalDialog } from '@/components/wallet/vault-approval-dialog';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { AccountError } from '@/lib/account-client';
import type { EmbeddedWallet, WalletApprover } from '@/lib/account-contract';
import { openWalletWindow, WalletWindowError, type SignRequest } from '@/lib/wallet-window';
import { formatUsd, shortAddress } from '@/lib/utils';
import { PaymentMethodsCard } from './payment-methods';
import { WithdrawDialog } from './withdraw-dialog';
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
      <WalletCard address={wallet.address as Address} approvers={wallet.approvers} />
      <PaymentMethodsCard />
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

function WalletCard({
  address,
  approvers,
}: {
  address: Address;
  approvers: WalletApprover[] | null;
}) {
  const { balanceNumber, balanceAtomic, isLoading, refetch } = useUsdcBalance(address, base.id);
  const [copied, setCopied] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

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
      description="Your account’s own wallet on Base. It pays OpenSignet while you’re signed in; sending funds anywhere else needs your approval."
    >
      {/* Balance first, with the one action that moves it. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Balance
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            {isLoading ? (
              <span className="inline-block h-8 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            ) : (
              <>
                <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
                  {formatUsd(balanceNumber).slice(1)}
                </span>
                <span className="text-sm font-medium text-muted-foreground">USDC on Base</span>
              </>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full shrink-0 sm:w-auto sm:min-w-[9.5rem]"
          disabled={!approvers?.length}
          title={
            approvers?.length ? undefined : 'Add an email or link a wallet to approve withdrawals'
          }
          onClick={() => setWithdrawing(true)}
        >
          <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Withdraw
        </Button>
      </div>

      {/* Where to send USDC to add funds. */}
      <div className="mt-5 border-t border-border/70 pt-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Deposit address
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary/70 px-3 py-2 font-mono text-[13px]">
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
      {withdrawing && approvers?.length ? (
        <WithdrawDialog
          wallet={address}
          balance={balanceAtomic}
          approvers={approvers}
          onClose={() => setWithdrawing(false)}
          onSent={() => {
            setWithdrawing(false);
            void refetch();
          }}
        />
      ) : null}
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
      description="Withdrawals, exporting the wallet and changing these approvers need an approval from one of these."
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
  return (
    <VaultApprovalDialog
      title="Confirm the change"
      emailDescription="Approve with a code sent to your current approval email."
      walletDescription="Approve by signing with your current approval wallet."
      approvers={approvers}
      start={(factor) => client.startApproverChange(factor)}
      onApproved={async (challenge) => {
        await client.applyApproverChange(challenge.challengeId);
        update(await client.get());
        toast.success('Wallet approvals updated');
        onClose();
      }}
      onClose={onClose}
    />
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
