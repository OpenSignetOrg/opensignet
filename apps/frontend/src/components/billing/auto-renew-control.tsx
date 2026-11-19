'use client';

import { useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { ApprovalSummary } from '@/components/wallet/approval-summary';
import { VaultApprovalDialog } from '@/components/wallet/vault-approval-dialog';
import { AccountError, createAccountClient } from '@/lib/account-client';
import type { WalletApprover } from '@/lib/account-contract';
import type { AccountPlan } from '@/lib/account-plan';
import {
  AutoRenewError,
  autoRenewOffNonces,
  autoRenewTerms,
  turnAutoRenewOff,
  turnAutoRenewOn,
  type MandateTerms,
} from '@/lib/auto-renew';

function dollars(atomic: string): string {
  const cents = Number(BigInt(atomic) / 10_000n);
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Automatic renewal for plans paid in USDC: on, the plan renews from the OpenSignet wallet;
 * off, it ends at the period end unless renewed by hand. Card plans renew on the card.
 */
export function AutoRenewControl({
  plan,
  onChange,
}: {
  plan: AccountPlan;
  onChange: (plan: AccountPlan) => void;
}) {
  const on = !plan.cancelAtPeriodEnd;
  const [terms, setTerms] = useState<MandateTerms | null>(null);
  const [approvers, setApprovers] = useState<WalletApprover[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (plan.plan === 'included' || plan.paymentMethod === 'card' || !plan.paymentMethod) return null;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const [nextTerms, wallet] = await Promise.all([
        autoRenewTerms(),
        createAccountClient().wallet(),
      ]);
      if (!wallet?.approvers?.length) throw new AutoRenewError('unavailable');
      setApprovers(wallet.approvers);
      setTerms(nextTerms);
    } catch (failure) {
      setError(
        failure instanceof AutoRenewError || failure instanceof AccountError
          ? failure.message
          : new AutoRenewError('unavailable').message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      const nonces = await autoRenewOffNonces();
      const cancellations = nonces.length
        ? await createAccountClient().cancelAuthorizations(nonces)
        : null;
      onChange(await turnAutoRenewOff(cancellations));
      setConfirmOff(false);
      toast.success('Automatic renewal is off');
    } catch (failure) {
      setError(
        failure instanceof AutoRenewError || failure instanceof AccountError
          ? failure.message
          : new AutoRenewError('unavailable').message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <RefreshCcw
            className="h-4 w-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          Automatic renewal {on ? 'is on' : 'is off'}
        </div>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {on
            ? 'Renews from your OpenSignet wallet. Keep enough USDC on Base in it before each renewal.'
            : 'Turn it on to renew from your OpenSignet wallet without doing anything each time.'}
        </p>
        {error ? <InlineNotice className="mt-2">{error}</InlineNotice> : null}
      </div>
      <Button
        type="button"
        variant={on ? 'ghost' : 'outline'}
        size="sm"
        className="h-9 w-full shrink-0 sm:w-auto"
        disabled={busy}
        onClick={() => (on ? setConfirmOff(true) : void start())}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {on ? 'Turn off' : 'Turn on'}
      </Button>

      {terms && approvers ? (
        <VaultApprovalDialog
          title="Turn on automatic renewal"
          emailDescription="Approve the renewals with a code sent to your email."
          walletDescription="Approve the renewals by signing with your linked wallet."
          approvers={approvers}
          start={(factor) => createAccountClient().startMandate(factor, terms)}
          onApproved={async (challenge) => {
            const signed = await createAccountClient().signMandate(challenge.challengeId);
            onChange(await turnAutoRenewOn(signed.renewals));
            setTerms(null);
            toast.success('Automatic renewal is on');
          }}
          onClose={() => setTerms(null)}
        >
          <ApprovalSummary
            icon={RefreshCcw}
            title={terms.summary}
            subtitle={`Up to ${terms.count} renewals`}
            amount={dollars(terms.value)}
            amountNote={terms.periodSeconds >= 365 * 86_400 ? 'a year' : 'a month'}
            rows={[
              { label: 'From', value: 'Your OpenSignet wallet' },
              { label: 'To', value: 'OpenSignet' },
              { label: 'Paid in', value: 'USDC on Base' },
            ]}
            note="Each renewal can only be charged within a few days of its date. Turn it off at any time and every unused one is cancelled."
          />
        </VaultApprovalDialog>
      ) : null}

      {confirmOff ? (
        <Dialog
          title="Turn off automatic renewal?"
          description={`Your plan stays active until ${plan.currentPeriodEnd ? new Date(plan.currentPeriodEnd).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the end of this period'}, then ends unless you renew it.`}
          onClose={() => setConfirmOff(false)}
          busy={busy}
        >
          <p className="text-sm leading-6 text-muted-foreground">
            Every future renewal payment you approved is cancelled on chain, so none can be used.
          </p>
          {error ? <InlineNotice className="mt-3">{error}</InlineNotice> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOff(false)}
              disabled={busy}
            >
              Keep it on
            </Button>
            <Button type="button" onClick={() => void stop()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Turn off
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
