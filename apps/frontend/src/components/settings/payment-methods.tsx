'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import {
  addCardUrl,
  brandName,
  CardError,
  listCards,
  makeDefaultCard,
  removeCard,
  type SavedCard,
  type SavedCards,
} from '@/lib/cards';
import { SettingsCard } from './settings-ui';

const message = (thrown: unknown) =>
  thrown instanceof CardError ? thrown.message : 'Nothing has changed. Try again in a moment.';

/** Payment methods: the cards saved with Stripe, which one renewals use, and Add card. */
export function PaymentMethodsCard() {
  const [cards, setCards] = useState<SavedCards | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SavedCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Back from Stripe's page: the card arrives with Stripe's webhook, a moment later.
  const [waiting, setWaiting] = useState(false);
  const countBefore = useRef(0);

  const load = useCallback(async () => {
    try {
      const next = await listCards();
      countBefore.current = next.items.length;
      setCards(next);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('card') === 'added') {
      setWaiting(true);
      window.history.replaceState(null, '', '/settings/wallet#payment-methods');
    }
    void load();
  }, [load]);

  useEffect(() => {
    if (!waiting || state !== 'ready') return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      void listCards()
        .then((next) => {
          const added = next.items.length > countBefore.current;
          if (added || tries >= 8) {
            window.clearInterval(timer);
            setCards(next);
            setWaiting(false);
            if (added) toast.success('Card added');
          }
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [waiting, state]);

  async function act(id: string, action: () => Promise<SavedCards>, done: string) {
    setBusy(id);
    setError(null);
    try {
      setCards(await action());
      setConfirm(null);
      toast.success(done);
    } catch (thrown) {
      setError(message(thrown));
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    setBusy('add');
    setError(null);
    try {
      window.location.assign(await addCardUrl());
    } catch (thrown) {
      setError(message(thrown));
      setBusy(null);
    }
  }

  const available = cards?.available ?? false;

  return (
    <SettingsCard
      id="payment-methods"
      title="Payment methods"
      description="Cards you pay with on OpenSignet. The default card pays renewals set to renew by card."
      footer={
        state === 'ready' ? (
          <>
            <p className="text-xs text-muted-foreground">
              {available
                ? 'You add a card on Stripe’s secure page. OpenSignet never sees the card number.'
                : 'Card payments open soon. Until then, pay with USDC from your wallet.'}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 w-full sm:w-auto"
              disabled={!available || busy !== null}
              onClick={() => void add()}
            >
              {busy === 'add' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              Add card
            </Button>
          </>
        ) : undefined
      }
    >
      {state === 'loading' ? (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only" role="status">
            Loading your cards
          </span>
          <div className="h-[58px] animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
        </div>
      ) : state === 'error' || !cards ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <span>Your cards couldn’t be loaded. Nothing has changed.</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Try again
          </Button>
        </div>
      ) : cards.items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/90 px-4 py-4 text-sm text-muted-foreground">
          <CreditCard className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          {waiting
            ? 'Adding your card. It appears here in a moment.'
            : 'No cards yet. A card you pay with at checkout is saved here too.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {cards.items.map((card) => (
            <li
              key={card.id}
              className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/50 px-3.5 py-3"
            >
              <span className="inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-border/80 bg-card text-muted-foreground">
                <CreditCard className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                  <span className="min-w-0">
                    {brandName(card.brand)} ending {card.last4}
                  </span>
                  {card.isDefault ? <Badge variant="outline">Default</Badge> : null}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                  <span>
                    Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                  </span>
                  {!card.isDefault ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void act(card.id, () => makeDefaultCard(card.id), 'Default card changed')
                      }
                      className="rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
                    >
                      Make default
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {busy === card.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Remove ${brandName(card.brand)} ending ${card.last4}`}
                  disabled={busy !== null}
                  onClick={() => setConfirm(card)}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && !confirm ? <InlineNotice className="mt-3">{error}</InlineNotice> : null}

      {confirm ? (
        <Dialog
          title={`Remove ${brandName(confirm.brand)} ending ${confirm.last4}?`}
          description="It can’t be charged again. Renewals set to renew by card use your default card."
          onClose={() => {
            setConfirm(null);
            setError(null);
          }}
          busy={busy !== null}
        >
          {error ? <InlineNotice>{error}</InlineNotice> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirm(null)}
              disabled={busy !== null}
            >
              Keep it
            </Button>
            <Button
              type="button"
              onClick={() => void act(confirm.id, () => removeCard(confirm.id), 'Card removed')}
              disabled={busy !== null}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Remove card
            </Button>
          </div>
        </Dialog>
      ) : null}
    </SettingsCard>
  );
}
