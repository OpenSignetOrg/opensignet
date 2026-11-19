'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useConfig, useDisconnect } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { base } from 'wagmi/chains';
import type { Address } from 'viem';
import {
  ArrowRight,
  Calculator,
  CalendarClock,
  Check,
  CircleCheck,
  Copy,
  CreditCard,
  Gauge,
  Loader2,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Wallet,
  WalletCards,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { createX402PaymentHeaders } from '@opensignet/sdk';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import type { ServicePlanSku } from '@opensignet/shared';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { SelectMenu } from '@/components/ui/select-menu';
import { ConnectWalletButton } from '@/components/wallet/connect-wallet-button';
import { ApprovalSummary } from '@/components/wallet/approval-summary';
import { VaultApprovalDialog } from '@/components/wallet/vault-approval-dialog';
import { useAccountSession } from '@/hooks/use-account-session';
import { useBaseChainGuard } from '@/hooks/use-base-chain';
import { useUsdcBalance } from '@/hooks/use-usdc-balance';
import { createAccountClient } from '@/lib/account-client';
import type { EmbeddedWallet } from '@/lib/account-contract';
import { isBaseChainMismatchError, isBaseChainRequiredError } from '@/lib/base-chain';
import { getTransactionErrorCopy } from '@/lib/transaction-errors';
import { cn, shortAddress } from '@/lib/utils';
import {
  BILLING_PERIODS,
  CheckoutError,
  CHECKOUT_ERROR_COPY,
  checkoutPath,
  checkoutPrice,
  createIdempotencyKey,
  formatCheckoutAmount,
  getCheckoutQuote,
  parseCheckoutSelection,
  payWalletCheckout,
  scheduleChange,
  startCardCheckout,
  startCryptoCheckout,
  startWalletCheckout,
  type BillingPeriod,
  type CheckoutMethod,
  type CheckoutQuote,
  type CheckoutSelection,
  type PaidPlanKey,
  type WalletCheckout,
} from '@/lib/checkout';

const PLAN_ICONS: Record<PaidPlanKey, LucideIcon> = {
  plus: Calculator,
  pro: Zap,
  max: Gauge,
  enterprise: ShieldCheck,
};

const ENTERPRISE_OPTIONS = ENTERPRISE_PLAN_OFFERS.map((offer) => ({
  value: offer.sku as ServicePlanSku,
  label: `${offer.monthlyEmails.toLocaleString('en-US')} emails`,
}));

const PLAN_LABELS: Record<string, string> = {
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
  enterprise: 'Enterprise',
};

function planFeatures(selection: CheckoutSelection, monthlyEmails: number): string[] {
  const entry = SERVICE_PLAN_CATALOG[selection.plan];
  const { limits } = entry;
  const support =
    entry.supportTier === 'enterprise'
      ? 'Enterprise support'
      : entry.supportTier === 'priority'
        ? 'Priority support'
        : null;
  return [
    `${monthlyEmails.toLocaleString('en-US')} emails a month, sent and received`,
    `${limits.apiKeys} API keys`,
    `${limits.dnsRecords} DNS records`,
    `${limits.emailAliases} email aliases`,
    ...(support ? [support] : []),
    `${limits.emailRetentionDays}-day email retention`,
  ];
}

const METHODS: ReadonlyArray<{
  value: CheckoutMethod;
  title: string;
  description: string;
  Icon: LucideIcon;
}> = [
  {
    value: 'wallet',
    title: 'OpenSignet wallet',
    description: 'USDC from your account’s own wallet, approved by you.',
    Icon: Wallet,
  },
  {
    value: 'crypto',
    title: 'Another wallet',
    description: 'USDC on Base from any wallet you connect.',
    Icon: WalletCards,
  },
  {
    value: 'card',
    title: 'Card',
    description: 'Visa, Mastercard, American Express and more, through Stripe.',
    Icon: CreditCard,
  },
];

type Notice = { tone: 'error' | 'info'; text: string } | null;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Plan checkout: order summary, account, payment method and a single protected pay action. */
export function CheckoutClient() {
  const params = useSearchParams();
  const router = useRouter();
  const selection = parseCheckoutSelection(params.get('plan'), params.get('period'));
  const canceled = params.get('canceled') === '1';

  const label = selection ? SERVICE_PLAN_CATALOG[selection.plan].label : null;
  return (
    <>
      <div className="mb-8 sm:mb-10">
        <p className="text-sm font-semibold text-[hsl(var(--brand-orange))]">Checkout</p>
        <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {label ? `Upgrade to ${label}` : 'Checkout'}
        </h1>
        {label ? (
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Choose how you would like to pay. Your plan covers your whole account.
          </p>
        ) : null}
      </div>
      {selection ? (
        <Checkout
          selection={selection}
          canceled={canceled}
          onChange={(next) => router.replace(checkoutPath(next), { scroll: false })}
        />
      ) : (
        <MissingPlan />
      )}
    </>
  );
}

function Checkout({
  selection,
  canceled,
  onChange,
}: {
  selection: CheckoutSelection;
  canceled: boolean;
  onChange: (next: Pick<CheckoutSelection, 'sku' | 'period'>) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const config = useConfig();
  const { address: connected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const session = useAccountSession();
  const { ensureBaseChain } = useBaseChainGuard();
  const signedIn = session.status === 'signed-in';

  const [method, setMethod] = useState<CheckoutMethod>('wallet');
  const [phase, setPhase] = useState<'idle' | 'working' | 'redirecting'>('idle');
  const [notice, setNotice] = useState<Notice>(
    canceled ? { tone: 'info', text: 'Payment canceled. Nothing was charged.' } : null,
  );
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [wallet, setWallet] = useState<EmbeddedWallet | null>(null);
  const [approval, setApproval] = useState<WalletCheckout | null>(null);
  /** One key per attempt: a retry of the same plan, period and method reuses it. */
  const attemptKey = useRef<string | null>(null);
  const busy = useRef(false);

  // A different plan, period or method is a new attempt with a new key.
  useEffect(() => {
    attemptKey.current = null;
  }, [method, selection.sku, selection.period]);

  // The account's wallet (its address, balance and approvers).
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    createAccountClient()
      .wallet(controller.signal)
      .then(setWallet)
      .catch(() => undefined);
    return () => controller.abort();
  }, [signedIn]);

  // The price for this account right now: credits, extensions and switches at renewal.
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    setQuoteFailed(false);
    getCheckoutQuote(selection, method, controller.signal)
      .then((next) => {
        setQuote(next);
        if (!next.cardAvailable && method === 'card') setMethod('wallet');
      })
      .catch(() => {
        if (!controller.signal.aborted) setQuoteFailed(true);
      });
    return () => controller.abort();
  }, [signedIn, selection, method]);

  const price = checkoutPrice(selection);
  const total = formatCheckoutAmount(price.amountAtomic);
  const entry = SERVICE_PLAN_CATALOG[selection.plan];
  const Icon = PLAN_ICONS[selection.plan];
  const periodLabel = selection.period === 'monthly' ? 'month' : 'year';
  const working = phase !== 'idle';
  const mode = quote?.mode ?? 'now';
  const credit = quote ? BigInt(quote.creditAtomic) : 0n;
  const due = quote ? BigInt(quote.dueAtomic) : price.amountAtomic;
  const cardAvailable = quote?.cardAvailable ?? false;
  const current = quote?.current ?? null;
  const returnTo = `${pathname}?${params.toString()}`;

  function fail(error: unknown) {
    setPhase('idle');
    if (error instanceof CheckoutError) {
      setNotice({ tone: 'error', text: error.message });
      return;
    }
    if (isBaseChainRequiredError(error) || isBaseChainMismatchError(error)) {
      setNotice({ tone: 'info', text: 'Switch your wallet to Base to pay with USDC.' });
      return;
    }
    const copy = getTransactionErrorCopy(error, {
      action: 'Payment',
      stage: 'signature',
      fallback: CHECKOUT_ERROR_COPY.unavailable,
    });
    setNotice({
      tone: copy.kind === 'cancelled' ? 'info' : 'error',
      text:
        copy.kind === 'cancelled'
          ? 'Payment canceled in your wallet. Nothing was charged.'
          : copy.description || CHECKOUT_ERROR_COPY.unavailable,
    });
  }

  async function pay() {
    if (busy.current || !signedIn) return;
    busy.current = true;
    setNotice(null);
    setPhase('working');
    attemptKey.current ??= createIdempotencyKey();
    const key = attemptKey.current;
    try {
      if (mode === 'at_renewal' && method !== 'card') {
        await scheduleChange(selection, method);
        setPhase('idle');
        toast.success(`Your plan changes on ${formatDate(quote?.startsAt ?? '')}`);
        router.push('/dashboard');
        return;
      }
      if (method === 'card') {
        const { checkoutUrl } = await startCardCheckout(selection, key);
        setPhase('redirecting');
        window.location.assign(checkoutUrl);
        return;
      }
      if (method === 'wallet') {
        setApproval(await startWalletCheckout(selection, key));
        setPhase('idle');
        return;
      }
      if (!connected) {
        setPhase('idle');
        setNotice({ tone: 'info', text: 'Connect the wallet you want to pay from first.' });
        return;
      }
      if (!(await ensureBaseChain())) {
        setPhase('idle');
        return;
      }
      const signer = await getWalletClient(config, {
        account: connected as Address,
        chainId: base.id,
      });
      if (!signer?.account) throw new CheckoutError('unavailable');
      const { checkoutId } = await startCryptoCheckout(selection, key, (requirement) =>
        createX402PaymentHeaders(requirement, signer),
      );
      setPhase('redirecting');
      router.push(`/checkout/complete?checkout=${encodeURIComponent(checkoutId)}`);
    } catch (error) {
      fail(error);
    } finally {
      busy.current = false;
    }
  }

  const dueText = formatCheckoutAmount(due);
  const payLabel =
    phase === 'redirecting'
      ? method === 'card'
        ? 'Opening secure payment…'
        : 'Confirming payment…'
      : phase === 'working'
        ? method === 'card'
          ? 'Preparing payment…'
          : method === 'wallet'
            ? 'Preparing your approval…'
            : 'Waiting for your wallet…'
        : mode === 'at_renewal'
          ? method === 'card'
            ? 'Add card for renewal'
            : `Switch on ${quote ? formatDate(quote.startsAt) : 'renewal'}`
          : method === 'card'
            ? 'Continue to payment'
            : `Pay ${dueText} with USDC`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-10">
      {/* Order summary: first on phones, on the right from large screens. */}
      <section
        aria-labelledby="checkout-summary"
        className="premium-surface rounded-2xl border p-5 sm:p-6 lg:order-2"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-primary shadow-sm">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 id="checkout-summary" className="text-lg font-semibold leading-tight">
                {entry.label} plan
              </h2>
              <p className="text-sm text-muted-foreground">For your whole account</p>
            </div>
          </div>
          <Link
            href="/pricing"
            className="rounded text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            Change
          </Link>
        </div>

        <PeriodSwitch
          value={selection.period}
          disabled={working}
          onChange={(period) => onChange({ sku: selection.sku, period })}
        />

        {selection.plan === 'enterprise' ? (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Monthly volume</div>
            <SelectMenu
              ariaLabel="Enterprise monthly volume"
              value={selection.sku}
              options={ENTERPRISE_OPTIONS}
              onChange={(sku) => onChange({ sku, period: selection.period })}
              disabled={working}
              triggerClassName="sm:h-10 sm:w-full"
              menuMinWidth={0}
            />
          </div>
        ) : null}

        <ul className="mt-5 space-y-2">
          {planFeatures(selection, price.monthlyEmails).map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" aria-hidden />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-6 space-y-2.5 border-t border-border/70 pt-5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">
              {entry.label} plan, billed {selection.period}
            </dt>
            <dd className="font-mono">{total}</dd>
          </div>
          {credit > 0n && mode === 'now' ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">
                Credit for the rest of your {current ? PLAN_LABELS[current.plan] : ''} plan
              </dt>
              <dd className="font-mono text-[hsl(146_45%_30%)]">−{formatCheckoutAmount(credit)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4 border-t border-border/70 pt-3">
            <dt className="font-semibold">Total due today</dt>
            <dd className="font-mono text-xl font-bold" aria-live="polite">
              {mode === 'at_renewal' ? '$0.00' : dueText}
            </dd>
          </div>
        </dl>
        {quote && mode === 'at_renewal' ? (
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Your current plan runs until {formatDate(quote.startsAt)}. This change starts then, and
            the first {total} is charged on that day.
          </p>
        ) : quote && mode === 'extend' ? (
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            You already have this plan. Paying now extends it by one {periodLabel} from{' '}
            {formatDate(quote.startsAt)}.
          </p>
        ) : (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {total} per {periodLabel}. Prices are in US dollars; crypto payments are made in USDC on
            Base, where 1 USDC equals 1 US dollar.
          </p>
        )}
      </section>

      {/* Account and payment. */}
      <section aria-labelledby="checkout-payment" className="lg:order-1">
        <div className="premium-surface rounded-2xl border p-5 sm:p-6">
          <h2 id="checkout-payment" className="sr-only">
            Payment
          </h2>

          <StepHeading index={1} title="Account" />
          {session.status === 'loading' ? (
            <div className="mt-3 h-[58px] animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
          ) : session.status === 'signed-in' ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/70 bg-background/50 px-4 py-3">
              <CircleCheck className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {session.account.displayName ?? 'Signed in'}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {session.account.email ?? 'Signed in with a wallet'}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">
                Sign in so the plan is added to your account.
              </p>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={`/sign-in?return_to=${encodeURIComponent(returnTo)}`}>
                  <LogIn className="h-4 w-4" aria-hidden />
                  Sign in to continue
                </Link>
              </Button>
            </div>
          )}

          <div className="my-6 border-t border-border/70" />

          <StepHeading index={2} title="Payment method" />
          <MethodPicker
            value={method}
            onChange={setMethod}
            disabled={working}
            cardAvailable={cardAvailable}
          />

          {signedIn && method === 'wallet' ? (
            <WalletPanel wallet={wallet} due={due} renewal={mode === 'at_renewal'} />
          ) : null}
          {signedIn && method === 'crypto' ? (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border/70 bg-background/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {connected ? (
                  <>
                    Paying from{' '}
                    <span className="font-mono text-foreground">{shortAddress(connected)}</span>
                  </>
                ) : (
                  'Connect the wallet you want to pay from.'
                )}
              </p>
              {connected ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 self-start px-2 text-xs sm:self-auto"
                  onClick={() => void disconnectAsync().catch(() => undefined)}
                  disabled={working}
                >
                  Use another wallet
                </Button>
              ) : (
                <ConnectWalletButton variant="outline" size="sm" label="Connect wallet" />
              )}
            </div>
          ) : null}

          {quoteFailed ? (
            <InlineNotice className="mt-5">
              The price for your account couldn’t be loaded. Check your connection and try again.
            </InlineNotice>
          ) : null}
          {notice ? (
            <InlineNotice tone={notice.tone} className="mt-5">
              {notice.text}
            </InlineNotice>
          ) : null}

          <Button
            type="button"
            size="lg"
            onClick={() => void pay()}
            disabled={!signedIn || working || !quote || (method === 'card' && !cardAvailable)}
            className="group/pay mt-5 h-12 w-full text-[15px]"
          >
            {working ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LockKeyhole className="h-4 w-4" aria-hidden />
            )}
            {payLabel}
            {!working ? (
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover/pay:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden
              />
            ) : null}
          </Button>
          {!signedIn && session.status !== 'loading' ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Sign in above to continue.
            </p>
          ) : null}

          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {method === 'card'
              ? "You pay on Stripe's secure page. OpenSignet never sees or stores your card details."
              : method === 'wallet'
                ? 'You approve the exact amount with a code or your linked wallet. Nothing moves before you approve.'
                : 'Your wallet shows the exact USDC amount first. Nothing is charged until you approve it.'}
          </p>
        </div>

        <p className="mt-4 px-1 text-xs leading-5 text-muted-foreground">
          By continuing, you agree to the{' '}
          <Link href="/terms" className="font-medium text-foreground underline underline-offset-4">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      {approval && wallet?.approvers ? (
        <VaultApprovalDialog
          title={`Approve ${formatCheckoutAmount(BigInt(approval.dueAtomic))}`}
          emailDescription="Approve this payment with a code sent to your email."
          walletDescription="Approve this payment by signing with your linked wallet."
          approvers={wallet.approvers}
          start={(factor) =>
            createAccountClient().startWalletPayment(factor, {
              to: approval.authorization.to,
              value: approval.authorization.value,
              validBefore: approval.authorization.validBefore,
              nonce: approval.authorization.nonce,
              summary: approval.summary,
            })
          }
          onApproved={async (challenge) => {
            const signature = await createAccountClient().signWalletPayment(challenge.challengeId);
            setPhase('redirecting');
            await payWalletCheckout(approval.checkoutId, signature);
            setApproval(null);
            router.push(`/checkout/complete?checkout=${encodeURIComponent(approval.checkoutId)}`);
          }}
          onClose={() => {
            setApproval(null);
            setPhase('idle');
          }}
        >
          <ApprovalSummary
            icon={Wallet}
            title={approval.summary}
            subtitle="One payment"
            amount={formatCheckoutAmount(BigInt(approval.dueAtomic))}
            rows={[
              { label: 'From', value: 'Your OpenSignet wallet' },
              { label: 'To', value: 'OpenSignet' },
              { label: 'Paid in', value: 'USDC on Base' },
            ]}
            note="This approval pays this exact amount once, to OpenSignet only."
          />
        </VaultApprovalDialog>
      ) : null}
    </div>
  );
}

/** The OpenSignet wallet as a payment source: its balance, and how to add USDC if short. */
function WalletPanel({
  wallet,
  due,
  renewal,
}: {
  wallet: EmbeddedWallet | null;
  due: bigint;
  renewal: boolean;
}) {
  const { balanceNumber, isLoading } = useUsdcBalance(
    (wallet?.address ?? undefined) as Address | undefined,
    base.id,
  );
  const [copied, setCopied] = useState(false);
  if (!wallet) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Loading your wallet…
      </p>
    );
  }
  const balanceAtomic = BigInt(Math.floor(balanceNumber * 1_000_000));
  const short = !isLoading && !renewal && balanceAtomic < due;
  async function copy() {
    try {
      await navigator.clipboard.writeText(wallet?.address ?? '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Couldn’t copy the address. Select it and copy it instead.');
    }
  }
  return (
    <div className="mt-4 rounded-xl border border-border/70 bg-background/50 px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Balance</span>
        <span className="font-mono font-semibold tabular-nums">
          {isLoading ? '…' : `${balanceNumber.toFixed(2)} USDC`}
        </span>
      </div>
      {short ? (
        <div className="mt-3 border-t border-border/70 pt-3">
          <p className="text-sm leading-6">
            Add at least {formatCheckoutAmount(due - balanceAtomic)} in USDC on Base to your wallet
            to pay this way.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-secondary/70 px-2.5 py-1.5 font-mono text-[12px]">
              {wallet.address}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => void copy()}
              aria-label={copied ? 'Address copied' : 'Copy wallet address'}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepHeading({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {index}
      </span>
      <h3 className="text-[15px] font-semibold">{title}</h3>
    </div>
  );
}

function PeriodSwitch({
  value,
  disabled,
  onChange,
}: {
  value: BillingPeriod;
  disabled?: boolean;
  onChange: (value: BillingPeriod) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="mt-5 grid grid-cols-2 rounded-lg border border-border/80 bg-secondary/60 p-1"
    >
      {BILLING_PERIODS.map((period) => {
        const selected = period === value;
        return (
          <button
            key={period}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(period)}
            className={cn(
              'inline-flex h-9 items-center justify-center rounded-md text-sm font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none',
              selected
                ? 'bg-primary text-primary-foreground shadow-[0_6px_14px_-8px_rgba(20,21,18,0.6)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {period === 'monthly' ? 'Monthly' : 'Yearly'}
          </button>
        );
      })}
    </div>
  );
}

function MethodPicker({
  value,
  onChange,
  disabled,
  cardAvailable,
}: {
  value: CheckoutMethod;
  onChange: (value: CheckoutMethod) => void;
  disabled?: boolean;
  cardAvailable: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const available = METHODS.filter((method) => method.value !== 'card' || cardAvailable);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, option: CheckoutMethod) => {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const index = available.findIndex((method) => method.value === option);
    const next = available[(index + step + available.length) % available.length];
    if (!next) return;
    onChange(next.value);
    refs.current[METHODS.findIndex((method) => method.value === next.value)]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Payment method" className="mt-3 grid gap-3">
      {METHODS.map(({ value: option, title, description, Icon }, index) => {
        const selected = option === value;
        const unavailable = option === 'card' && !cardAvailable;
        return (
          <button
            key={option}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={unavailable || undefined}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || unavailable}
            onClick={() => onChange(option)}
            onKeyDown={(event) => onKeyDown(event, option)}
            className={cn(
              'relative flex items-start gap-3 rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none',
              unavailable && 'opacity-60',
              selected
                ? 'border-primary/70 bg-card shadow-[0_10px_24px_-18px_rgba(20,21,18,0.55)] ring-1 ring-primary/40'
                : 'border-border/80 bg-background/50 hover:border-primary/35 hover:bg-card/80',
            )}
          >
            <span
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/80 text-muted-foreground ring-1 ring-inset ring-border/70',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {title}
                {unavailable ? (
                  <span className="rounded-full border border-border/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Coming soon
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {description}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-primary bg-primary' : 'border-border bg-background',
              )}
            >
              {selected ? (
                <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MissingPlan() {
  return (
    <div className="premium-surface mx-auto max-w-lg rounded-2xl border p-6 text-center sm:p-8">
      <h2 className="text-lg font-semibold">Choose a plan to continue</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        This checkout link does not name a plan we offer. Pick a plan on the pricing page and
        continue from there.
      </p>
      <Button asChild className="mt-5">
        <Link href="/pricing">
          See plans
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
