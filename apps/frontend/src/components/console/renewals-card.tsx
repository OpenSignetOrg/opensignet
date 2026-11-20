'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { AutoRenewError, setDomainAutoRenew } from '@/lib/auto-renew';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';
import { formatDate } from '@/lib/utils';
import { IdentityTile } from './identity-bits';

/**
 *   GET /api/v1/billing/renewals -> { items: IdentityRenewal[] } (soonest first)
 */
const renewalSchema = z
  .object({
    id: z.string().uuid(),
    domain: z.string(),
    status: z.string(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    autoRenew: z.boolean(),
    renewalMethod: z.enum(['wallet', 'card']),
    changeable: z.boolean(),
  })
  .strict();
type IdentityRenewal = z.infer<typeof renewalSchema>;
const listSchema = z.object({ items: z.array(renewalSchema) }).strict();

/** Only `autoRenew` matters here; the rest of the domain settings are read on the Domain tab. */
const toggledSchema = z.object({ autoRenew: z.boolean() }).passthrough();

const PAGE = 10;

/** Billing: every identity's yearly domain renewal, with its switch, soonest first. */
export function RenewalsCard() {
  const [items, setItems] = useState<IdentityRenewal[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<IdentityRenewal | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    fetch('/api/v1/billing/renewals', {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const parsed = listSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setItems(parsed.items);
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [attempt]);

  async function change(item: IdentityRenewal, on: boolean) {
    setBusy(item.id);
    try {
      const next = await setDomainAutoRenew(item.id, on, toggledSchema);
      setItems((list) =>
        list
          ? list.map((row) => (row.id === item.id ? { ...row, autoRenew: next.autoRenew } : row))
          : list,
      );
      setConfirm(null);
      toast.success(on ? 'Automatic renewal is on' : 'Automatic renewal is off', {
        description: on
          ? `${item.domain} renews ${item.renewalMethod === 'card' ? 'on your card' : 'from your OpenSignet wallet'} each year.`
          : `Renew ${item.domain} before its renewal date to keep it.`,
      });
    } catch (thrown) {
      toast.error('Couldn’t change automatic renewal', {
        description:
          thrown instanceof AutoRenewError
            ? thrown.message
            : new AutoRenewError('unavailable').message,
      });
    } finally {
      setBusy(null);
    }
  }

  const total = items?.length ?? 0;
  const renewing = items?.filter((item) => item.autoRenew).length ?? 0;

  return (
    <section aria-labelledby="billing-renewals" className="console-card mb-8 overflow-hidden">
      <div className="flex flex-col gap-1 px-5 pb-4 pt-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2
            id="billing-renewals"
            className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            Identity renewals
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Each domain renews once a year. Open one to choose how it’s paid.
          </p>
        </div>
        {state === 'ready' && total > 0 ? (
          <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
            {renewing} of {total} renew automatically
          </span>
        ) : null}
      </div>

      {state === 'loading' ? (
        <ul aria-busy="true" className="border-t border-border/60">
          <li className="sr-only" role="status">
            Loading renewals
          </li>
          {[0, 1, 2].map((index) => (
            <li
              key={index}
              className="flex items-center gap-3 border-b border-border/50 px-5 py-3.5 last:border-b-0 sm:px-6"
            >
              <span className="h-9 w-9 animate-pulse rounded-lg bg-foreground/[0.06] motion-reduce:animate-none" />
              <span className="flex-1 space-y-1.5">
                <span className="block h-3.5 w-40 max-w-full animate-pulse rounded bg-foreground/[0.06] motion-reduce:animate-none" />
                <span className="block h-3 w-28 animate-pulse rounded bg-foreground/[0.05] motion-reduce:animate-none" />
              </span>
              <span className="h-6 w-[42px] animate-pulse rounded-full bg-foreground/[0.06] motion-reduce:animate-none" />
            </li>
          ))}
        </ul>
      ) : state === 'error' || !items ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 border-t border-border/60 px-5 py-4 text-[13.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6"
        >
          <span>Your renewals couldn’t be loaded. Nothing has changed.</span>
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="border-t border-border/60 px-5 py-6 text-center sm:px-6">
          <p className="text-[13.5px] text-muted-foreground">
            No identities yet. Their renewals appear here once you have one.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/register">Get a domain</Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="border-t border-border/60">
            {items.slice(0, shown).map((item) => (
              <RenewalRow
                key={item.id}
                item={item}
                busy={busy === item.id}
                locked={busy !== null}
                onToggle={(on) => (on ? void change(item, true) : setConfirm(item))}
              />
            ))}
          </ul>
          {items.length > shown ? (
            <div className="border-t border-border/60 px-5 py-2.5 sm:px-6">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full text-[13px] font-medium"
                onClick={() => setShown((n) => n + PAGE)}
              >
                Show {Math.min(PAGE, items.length - shown)} more
                <span className="text-muted-foreground">· {items.length - shown} left</span>
              </Button>
            </div>
          ) : null}
        </>
      )}

      {confirm ? (
        <Dialog
          title="Turn off automatic renewal?"
          description={`${confirm.domain} stays yours until ${confirm.expiresAt ? formatDate(confirm.expiresAt) : 'its renewal date'}. After that it can be lost unless you renew it.`}
          onClose={() => setConfirm(null)}
          busy={busy !== null}
        >
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirm(null)}
              disabled={busy !== null}
            >
              Keep it on
            </Button>
            <Button
              type="button"
              onClick={() => void change(confirm, false)}
              disabled={busy !== null}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Turn off
            </Button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

function RenewalRow({
  item,
  busy,
  locked,
  onToggle,
}: {
  item: IdentityRenewal;
  busy: boolean;
  locked: boolean;
  onToggle: (on: boolean) => void;
}) {
  const href = `/dashboard/identities/${encodeURIComponent(item.id)}/domain#renewal`;
  const expires = item.expiresAt ? new Date(item.expiresAt) : null;
  const soon = expires !== null && expires.getTime() - Date.now() < 30 * 86_400_000;
  const switchId = `renew-${item.id}`;
  const detail = !item.changeable
    ? item.status === 'expired'
      ? 'Expired'
      : 'Being registered'
    : expires
      ? item.autoRenew
        ? `Renews ${formatDate(expires)} · ${item.renewalMethod === 'card' ? 'Card' : 'Wallet'}`
        : `Expires ${formatDate(expires)} · Not renewing`
      : 'Renewal date pending';

  return (
    <li className="group relative flex items-center gap-3 border-b border-border/50 px-5 py-3 transition-colors last:border-b-0 hover:bg-foreground/[0.025] sm:px-6">
      <IdentityTile domain={item.domain} />
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate text-[14px] font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring/60"
        >
          {item.domain}
        </Link>
        <p
          className={`mt-0.5 truncate text-[12.5px] ${soon && !item.autoRenew && item.changeable ? 'font-medium text-[hsl(22_80%_38%)]' : 'text-muted-foreground'}`}
        >
          {detail}
        </p>
      </div>
      <div className="relative z-[1] flex shrink-0 items-center gap-2">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
        <Switch
          id={switchId}
          aria-label={`Automatic renewal for ${item.domain}`}
          checked={item.autoRenew}
          disabled={locked || !item.changeable}
          onCheckedChange={onToggle}
        />
        <ChevronRight
          className="hidden h-4 w-4 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 sm:block"
          aria-hidden
        />
      </div>
    </li>
  );
}
