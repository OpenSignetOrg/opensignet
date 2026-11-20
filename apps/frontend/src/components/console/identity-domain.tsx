'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  Globe,
  Lock,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Switch } from '@/components/ui/switch';
import { ApprovalSummary } from '@/components/wallet/approval-summary';
import { VaultApprovalDialog } from '@/components/wallet/vault-approval-dialog';
import { AccountError, createAccountClient } from '@/lib/account-client';
import type { WalletApprover } from '@/lib/account-contract';
import {
  AutoRenewError,
  domainAutoRenewOffNonces,
  domainAutoRenewTerms,
  turnDomainAutoRenewOff,
  turnDomainAutoRenewOn,
  type MandateTerms,
} from '@/lib/auto-renew';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';
import { formatDate, timeAgo } from '@/lib/utils';
import { StatusPill } from './identity-bits';
import { useIdentity } from './identity-shell';

/**
 *   GET   /api/v1/agents/:id/domain                       -> DomainSettings
 *   PATCH /api/v1/agents/:id/domain { transferLock }      -> DomainSettings (signed-in owner only)
 */
const domainSettingsSchema = z
  .object({
    domain: z.string(),
    status: z.string(),
    registered: z.boolean(),
    registrar: z.string().nullable(),
    registeredAt: z.string(),
    expiresAt: z.string().nullable(),
    autoRenew: z.boolean(),
    nameservers: z.array(z.string()),
    nameserversManaged: z.boolean(),
    transferLock: z.boolean(),
    whoisPrivacy: z.boolean(),
    /** One year's renewal in USDC atomic units (registrar cost), when it can be quoted. */
    renewalPrice: z.string().nullable(),
    autoRenewAvailable: z.boolean(),
  })
  .strict();
type DomainSettings = z.infer<typeof domainSettingsSchema>;

const DAY = 86_400_000;

/** The Domain tab: registration, renewal, nameservers and transfer security. */
export function IdentityDomainTab() {
  const { view } = useIdentity();
  const id = view.agent.id;
  const [settings, setSettings] = useState<DomainSettings | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    fetch(`/api/v1/agents/${encodeURIComponent(id)}/domain`, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const parsed = domainSettingsSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setSettings(parsed);
          setState('ready');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [id, attempt]);

  const setLock = useCallback(
    async (locked: boolean) => {
      setSaving(true);
      try {
        const response = await fetch(`/api/v1/agents/${encodeURIComponent(id)}/domain`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transferLock: locked }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            body &&
            typeof body === 'object' &&
            'message' in body &&
            typeof body.message === 'string'
              ? body.message
              : 'Nothing has changed. Try again in a moment.';
          toast.error('Couldn’t change the transfer lock', { description: message });
          return;
        }
        setSettings(domainSettingsSchema.parse(body));
        toast.success(locked ? 'Transfer lock is on' : 'Transfer lock is off', {
          description: locked
            ? 'The domain can’t be moved to another registrar.'
            : 'Turn it back on once your transfer is done.',
        });
      } catch {
        toast.error('Couldn’t change the transfer lock', {
          description: 'Check your connection. Nothing has changed.',
        });
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  if (state === 'error') {
    return (
      <div
        role="alert"
        className="console-card flex flex-col items-start gap-3 px-5 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <span>The domain settings couldn’t be loaded. Nothing has changed.</span>
        <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Try again
        </Button>
      </div>
    );
  }
  if (state === 'loading' || !settings) {
    return (
      <div className="grid gap-5 lg:grid-cols-2" aria-busy="true">
        <span className="sr-only" role="status">
          Loading the domain settings
        </span>
        {[220, 220, 180, 180].map((height, index) => (
          <div
            key={index}
            style={{ height }}
            className="animate-pulse rounded-[14px] bg-foreground/[0.04] motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  const expires = settings.expiresAt ? new Date(settings.expiresAt) : null;
  const registered = new Date(settings.registeredAt);
  const term = expires ? expires.getTime() - registered.getTime() : 0;
  const left = expires ? Math.max(0, expires.getTime() - Date.now()) : 0;
  const share = term > 0 ? Math.min(1, left / term) : 0;
  const soon = expires !== null && left < 30 * DAY;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel icon={Globe} title="Registration">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Fact label="Domain">
            <a
              href={`https://${settings.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex max-w-full items-center gap-1 hover:underline"
            >
              <span className="truncate">{settings.domain}</span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
            </a>
          </Fact>
          <Fact label="Status">
            <StatusPill status={settings.status} />
          </Fact>
          <Fact label="Registered">{formatDate(registered)}</Fact>
          <Fact label="Registrar">{settings.registrar ?? 'Being registered'}</Fact>
        </dl>
      </Panel>

      <Panel icon={RefreshCw} title="Renewal">
        {expires ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-[12px] font-medium text-muted-foreground">Renews by</div>
                <div className="mt-0.5 text-[20px] font-semibold tracking-[-0.01em]">
                  {formatDate(expires)}
                </div>
              </div>
              <span
                className={`text-[13px] font-medium ${soon ? 'text-[hsl(22_80%_38%)]' : 'text-muted-foreground'}`}
              >
                {timeAgo(expires)}
              </span>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]"
              role="img"
              aria-label={`${Math.round(share * 100)}% of the registration period left`}
            >
              <div
                className={`h-full rounded-full ${soon ? 'bg-[hsl(22_85%_52%)]' : 'bg-foreground/70'}`}
                style={{ width: `${Math.max(2, share * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-[13.5px] text-muted-foreground">
            The renewal date appears once registration is complete.
          </p>
        )}
        <DomainAutoRenew identityId={id} settings={settings} onChange={setSettings} />
      </Panel>

      <Panel icon={Server} title="Nameservers">
        <p className="mb-3 text-[13px] leading-5 text-muted-foreground">
          DNS and email for this domain run on OpenSignet’s nameservers. They are set at the
          registrar for you.
        </p>
        <ul className="overflow-hidden rounded-xl border border-border/75">
          {settings.nameservers.map((nameserver) => (
            <li
              key={nameserver}
              className="flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5 last:border-b-0"
            >
              <span className="truncate font-mono text-[13px]">{nameserver}</span>
              <CopyButton value={nameserver} />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel icon={ShieldCheck} title="Security">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label
              htmlFor="transfer-lock"
              className="flex items-center gap-1.5 text-[13.5px] font-medium"
            >
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Transfer lock
            </label>
            <p
              id="transfer-lock-help"
              className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground"
            >
              {settings.registered
                ? 'Stops anyone moving this domain to another registrar. Turn it off only while you move it yourself.'
                : 'Available once the domain is registered.'}
            </p>
          </div>
          <Switch
            id="transfer-lock"
            aria-describedby="transfer-lock-help"
            checked={settings.transferLock}
            disabled={saving || !settings.registered}
            onCheckedChange={(checked) => void setLock(checked)}
          />
        </div>
        <div className="mt-4 flex items-start justify-between gap-4 border-t border-border/60 pt-4">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium">WHOIS privacy</div>
            <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">
              Your contact details are hidden from public WHOIS wherever the registry allows it.
            </p>
          </div>
          <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-border/80 bg-card/80 px-2.5 text-[12px] font-medium text-foreground/85">
            {settings.whoisPrivacy ? 'On' : 'Off'}
          </span>
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Globe;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="console-card flex flex-col px-5 py-5 sm:px-6">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 text-[14px]">{children}</dd>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : `Copy ${value}`}
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () =>
            toast.error('Couldn’t copy', { description: 'Select the text and copy it instead.' }),
        );
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-[hsl(143_45%_32%)]" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

function dollars(atomic: string): string {
  return `$${(Number(atomic) / 1_000_000).toFixed(2)}`;
}

/**
 * Automatic renewal of the domain from the OpenSignet wallet: on approves two yearly payments
 * with the wallet vault; off cancels every unused one.
 */
function DomainAutoRenew({
  identityId,
  settings,
  onChange,
}: {
  identityId: string;
  settings: DomainSettings;
  onChange: (settings: DomainSettings) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<MandateTerms | null>(null);
  const [approvers, setApprovers] = useState<WalletApprover[] | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const on = settings.autoRenew;
  const price = settings.renewalPrice ? dollars(settings.renewalPrice) : null;

  const failure = (thrown: unknown) =>
    thrown instanceof AutoRenewError || thrown instanceof AccountError
      ? thrown.message
      : new AutoRenewError('unavailable').message;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const [nextTerms, wallet] = await Promise.all([
        domainAutoRenewTerms(identityId),
        createAccountClient().wallet(),
      ]);
      if (!wallet?.approvers?.length) throw new AutoRenewError('unavailable');
      setApprovers(wallet.approvers);
      setTerms(nextTerms);
    } catch (thrown) {
      setError(failure(thrown));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      const nonces = await domainAutoRenewOffNonces(identityId);
      const cancellations = nonces.length
        ? await createAccountClient().cancelAuthorizations(nonces)
        : null;
      onChange(await turnDomainAutoRenewOff(identityId, cancellations, domainSettingsSchema));
      setConfirmOff(false);
      toast.success('Automatic renewal is off', {
        description: `Renew ${settings.domain} before its renewal date to keep it.`,
      });
    } catch (thrown) {
      setError(failure(thrown));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border/60 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor="domain-auto-renew" className="text-[13.5px] font-medium">
            Automatic renewal
          </label>
          <p
            id="domain-auto-renew-help"
            className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground"
          >
            {!settings.autoRenewAvailable
              ? 'Available once the domain is registered and active.'
              : on
                ? `Renews from your OpenSignet wallet each year${price ? ` for ${price}` : ''}. Keep enough USDC on Base in it from 30 days before the renewal date.`
                : `Turn it on to renew from your OpenSignet wallet each year${price ? ` for ${price}` : ''}, with nothing to do each time.`}
          </p>
        </div>
        <Switch
          id="domain-auto-renew"
          aria-describedby="domain-auto-renew-help"
          checked={on}
          disabled={busy || (!on && !settings.autoRenewAvailable)}
          onCheckedChange={(checked) => (checked ? void start() : setConfirmOff(true))}
        />
      </div>
      {error ? <InlineNotice className="mt-3">{error}</InlineNotice> : null}

      {terms && approvers ? (
        <VaultApprovalDialog
          title="Turn on automatic renewal"
          emailDescription="Approve the renewals with a code sent to your email."
          walletDescription="Approve the renewals by signing with your linked wallet."
          approvers={approvers}
          start={(factor) => createAccountClient().startMandate(factor, terms)}
          onApproved={async (challenge) => {
            const signed = await createAccountClient().signMandate(challenge.challengeId);
            onChange(
              await turnDomainAutoRenewOn(identityId, signed.renewals, domainSettingsSchema),
            );
            setTerms(null);
            toast.success('Automatic renewal is on', {
              description: `${settings.domain} renews from your OpenSignet wallet each year.`,
            });
          }}
          onClose={() => setTerms(null)}
        >
          <ApprovalSummary
            icon={RefreshCw}
            title={`${settings.domain} renewal`}
            subtitle={`Up to ${terms.count} yearly renewals`}
            amount={dollars(terms.value)}
            amountNote="a year"
            rows={[
              { label: 'From', value: 'Your OpenSignet wallet' },
              { label: 'To', value: 'OpenSignet' },
              { label: 'Paid in', value: 'USDC on Base' },
            ]}
            note="Each renewal can only be charged from 30 days to 7 days before the domain expires. Turn it off at any time and every unused one is cancelled."
          />
        </VaultApprovalDialog>
      ) : null}

      {confirmOff ? (
        <Dialog
          title="Turn off automatic renewal?"
          description={`${settings.domain} stays yours until ${settings.expiresAt ? formatDate(settings.expiresAt) : 'its renewal date'}. After that it can be lost unless you renew it.`}
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
              Turn off
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
