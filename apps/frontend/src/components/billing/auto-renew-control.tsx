'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { cancelScheduledChange, renewFromWallet, type AccountPlan } from '@/lib/account-plan';
import { checkoutPath } from '@/lib/checkout';
import type { ServicePlanSku } from '@opensignet/shared';
import { AutoRenewError, turnAutoRenewOff, turnAutoRenewOn } from '@/lib/auto-renew';

function longDate(iso: string | null): string | null {
  return iso
    ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
}

/**
 * Automatic renewal of the plan, as a switch. Signed in, it needs no code (owner decision): on,
 * the plan renews at the end of each period, from the OpenSignet wallet when paid in USDC or on
 * the card when paid by card; off, it ends at the period end unless renewed by hand.
 */
export function AutoRenewControl({
  plan,
  onChange,
}: {
  plan: AccountPlan;
  onChange: (plan: AccountPlan) => void;
}) {
  const labelId = useId();
  const router = useRouter();
  const on = !plan.cancelAtPeriodEnd;
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (plan.plan === 'included' || !plan.paymentMethod) return null;

  const renewsBy = plan.scheduled?.paymentMethod ?? plan.paymentMethod;
  const date = longDate(plan.currentPeriodEnd);
  const byCard = renewsBy === 'card';

  /** How the next renewals are paid; it applies from the next renewal. */
  async function choose(method: 'wallet' | 'card') {
    if (method === 'card') {
      // A card is collected on Stripe's page, billing only from the renewal date.
      if (!plan.sku || !plan.period) return;
      router.push(
        `${checkoutPath({ sku: plan.sku as ServicePlanSku, period: plan.period })}&switch=card`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Paid in USDC with a move to card waiting: dropping that move is enough.
      onChange(
        await (plan.paymentMethod !== 'card' && plan.scheduled?.paymentMethod === 'card'
          ? cancelScheduledChange()
          : renewFromWallet(plan)),
      );
      toast.success('Renews from your wallet', {
        description: `From ${date ?? 'the next renewal'}, your plan renews from your OpenSignet wallet.`,
      });
    } catch {
      setError('The payment method couldn’t be changed. Nothing changed; try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      onChange(await (next ? turnAutoRenewOn() : turnAutoRenewOff()));
      setConfirmOff(false);
      toast.success(next ? 'Automatic renewal is on' : 'Automatic renewal is off');
    } catch (failure) {
      setError(
        failure instanceof AutoRenewError
          ? failure.message
          : new AutoRenewError('unavailable').message,
      );
    } finally {
      setBusy(false);
    }
  }

  const detail = on
    ? byCard
      ? `Renews${date ? ` on ${date}` : ''} on your card.`
      : `Renews${date ? ` on ${date}` : ''} from your OpenSignet wallet. Keep enough USDC on Base in it; we remind you before.`
    : `Your plan ends${date ? ` on ${date}` : ' at the end of this period'}. Turn this on to keep it without doing anything.`;

  return (
    <div className="border-t border-border/60 px-5 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 text-sm">
          <div id={labelId} className="flex items-center gap-2 font-medium">
            <RefreshCcw
              className="h-4 w-4 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
              aria-hidden
            />
            Automatic renewal
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
          {error && !confirmOff ? <InlineNotice className="mt-2">{error}</InlineNotice> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {busy && !confirmOff ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          ) : null}
          <Switch
            checked={on}
            disabled={busy}
            aria-labelledby={labelId}
            onCheckedChange={(next) => (next ? void change(true) : setConfirmOff(true))}
          />
        </div>
      </div>
      {on ? (
        <div className="mt-3.5 flex flex-col gap-2 border-t border-dashed border-border/70 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[13px] font-medium">Pay renewals with</div>
            <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
              A change applies from the next renewal.
            </p>
          </div>
          <Segmented
            label="Pay renewals with"
            value={byCard ? 'card' : 'wallet'}
            disabled={busy}
            onChange={(method) => void choose(method)}
            className="w-full sm:w-auto"
            options={[
              { value: 'wallet', label: 'OpenSignet wallet' },
              {
                value: 'card',
                label: 'Card',
                disabledReason:
                  plan.cardAvailable || byCard ? undefined : 'Card payments open soon',
              },
            ]}
          />
        </div>
      ) : null}

      {confirmOff ? (
        <Dialog
          title="Turn off automatic renewal?"
          description={`Your plan stays active until ${date ?? 'the end of this period'}, then ends unless you renew it.`}
          onClose={() => {
            setConfirmOff(false);
            setError(null);
          }}
          busy={busy}
        >
          {error ? <InlineNotice>{error}</InlineNotice> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOff(false)}
              disabled={busy}
            >
              Keep it on
            </Button>
            <Button type="button" onClick={() => void change(false)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Turn off
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
