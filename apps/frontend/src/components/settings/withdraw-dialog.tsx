'use client';

import { useId, useState, type FormEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatUnits, getAddress, isAddress } from 'viem';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { ApprovalSummary } from '@/components/wallet/approval-summary';
import { VaultApprovalDialog } from '@/components/wallet/vault-approval-dialog';
import { createAccountClient } from '@/lib/account-client';
import type { WalletApprover } from '@/lib/account-contract';
import { shortAddress } from '@/lib/utils';
import { completeWithdrawal, usdcToAtomic, WithdrawError } from '@/lib/withdraw';

const usd = (atomic: bigint) =>
  Number(formatUnits(atomic, 6)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

/**
 * Withdraw: send USDC from the OpenSignet wallet to an address on Base. The amount and recipient
 * are checked here, then approved with an email code or the linked wallet; OpenSignet pays the
 * network fee and emails a receipt with the transaction.
 */
export function WithdrawDialog({
  wallet,
  balance,
  approvers,
  onClose,
  onSent,
}: {
  wallet: string;
  /** The wallet's USDC balance, in atomic units. */
  balance: bigint;
  approvers: WalletApprover[];
  onClose: () => void;
  onSent: () => void;
}) {
  const toId = useId();
  const amountId = useId();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<{ to?: string; amount?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [ready, setReady] = useState<{ to: string; value: bigint } | null>(null);

  function review(event: FormEvent) {
    event.preventDefault();
    const next: { to?: string; amount?: string } = {};
    const recipient = to.trim();
    if (!isAddress(recipient, { strict: false })) {
      next.to = 'Enter a wallet address on Base, starting with 0x.';
    } else if (recipient.toLowerCase() === wallet.toLowerCase()) {
      next.to = 'This is your OpenSignet wallet. Enter the address you want to send to.';
    }
    const value = usdcToAtomic(amount);
    if (value === null) {
      next.amount = 'Enter an amount above zero, with up to 6 decimals.';
    } else if (value > balance) {
      next.amount = `Your wallet holds ${usd(balance)} USDC.`;
    }
    setErrors(next);
    if (next.to || next.amount || value === null) return;
    setFailure(null);
    setReady({ to: getAddress(recipient), value });
  }

  if (ready) {
    return (
      <VaultApprovalDialog
        title={`Send ${usd(ready.value)} USDC`}
        emailDescription="Approve this withdrawal with a code sent to your email."
        walletDescription="Approve this withdrawal by signing with your linked wallet."
        approvers={approvers}
        start={(factor) =>
          createAccountClient().startWithdrawal(factor, ready.to, ready.value.toString())
        }
        onApproved={async (challenge) => {
          try {
            const sent = await completeWithdrawal(challenge.challengeId);
            toast.success(`Sent ${usd(ready.value)} USDC`, {
              description:
                sent.status === 'confirmed'
                  ? `To ${shortAddress(ready.to)} on Base.`
                  : `To ${shortAddress(ready.to)}. It confirms on Base in a moment.`,
              action: {
                label: 'View',
                onClick: () => window.open(sent.txUrl, '_blank', 'noopener,noreferrer'),
              },
            });
            onSent();
          } catch (thrown) {
            setReady(null);
            setFailure(
              thrown instanceof WithdrawError
                ? thrown.message
                : 'The withdrawal couldn’t be sent right now. Nothing was sent; try again.',
            );
          }
        }}
        onClose={() => setReady(null)}
      >
        <ApprovalSummary
          icon={ArrowUpRight}
          title="Withdrawal"
          subtitle="One transfer"
          amount={`${usd(ready.value)} USDC`}
          rows={[
            { label: 'From', value: 'Your OpenSignet wallet' },
            {
              label: 'To',
              value: (
                <span className="font-mono text-[12.5px] [overflow-wrap:anywhere]">{ready.to}</span>
              ),
            },
            { label: 'Network', value: 'Base' },
            { label: 'Network fee', value: 'Paid by OpenSignet' },
          ]}
          note="Transfers on Base can’t be reversed. Check the address before you approve."
        />
      </VaultApprovalDialog>
    );
  }

  return (
    <Dialog
      title="Withdraw USDC"
      description="Send USDC from your OpenSignet wallet to another wallet on Base."
      onClose={onClose}
    >
      <form onSubmit={review} noValidate className="space-y-4">
        <div>
          <label htmlFor={toId} className="text-sm font-medium">
            Send to
          </label>
          <Input
            id={toId}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              if (errors.to) setErrors({ ...errors, to: undefined });
            }}
            placeholder="0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.to)}
            aria-describedby={`${toId}-help`}
            className="mt-1.5 font-mono text-[13px]"
          />
          <p
            id={`${toId}-help`}
            className={`mt-1.5 text-xs leading-5 ${errors.to ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {errors.to ?? 'An address on Base. USDC sent to another network can be lost.'}
          </p>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={amountId} className="text-sm font-medium">
              Amount
            </label>
            <span className="text-xs tabular-nums text-muted-foreground">
              Available {usd(balance)} USDC
            </span>
          </div>
          <div className="relative mt-1.5">
            <Input
              id={amountId}
              value={amount}
              inputMode="decimal"
              onChange={(event) => {
                setAmount(event.target.value);
                if (errors.amount) setErrors({ ...errors, amount: undefined });
              }}
              placeholder="0.00"
              autoComplete="off"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? `${amountId}-error` : undefined}
              className="pr-28 tabular-nums"
            />
            <div className="absolute inset-y-0 right-1.5 flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">USDC</span>
              <button
                type="button"
                onClick={() => {
                  setAmount(formatUnits(balance, 6));
                  setErrors({ ...errors, amount: undefined });
                }}
                className="h-7 rounded-md border border-border/80 bg-card px-2 text-xs font-medium transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Max
              </button>
            </div>
          </div>
          {errors.amount ? (
            <p id={`${amountId}-error`} className="mt-1.5 text-xs leading-5 text-destructive">
              {errors.amount}
            </p>
          ) : null}
        </div>
        {failure ? <InlineNotice>{failure}</InlineNotice> : null}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Review withdrawal</Button>
        </div>
      </form>
    </Dialog>
  );
}
