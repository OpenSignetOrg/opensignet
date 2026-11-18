'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useConfig } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { base } from 'wagmi/chains';
import type { Address } from 'viem';
import {
  ArrowRight,
  Calculator,
  Check,
  CircleCheck,
  CreditCard,
  Gauge,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { createX402PaymentHeaders } from '@opensignet/sdk';
import { ENTERPRISE_PLAN_OFFERS, SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import type { ServicePlanSku } from '@opensignet/shared';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { SelectMenu } from '@/components/ui/select-menu';
import { HeaderAccountButton } from '@/components/wallet/header-account-button';
import { useSiwe } from '@/hooks/use-siwe';
import { useBaseChainGuard } from '@/hooks/use-base-chain';
import { isBaseChainMismatchError, isBaseChainRequiredError } from '@/lib/base-chain';
import { getTransactionErrorCopy } from '@/lib/transaction-errors';
import { shortAddress } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  BILLING_PERIODS,
  CheckoutError,
  CHECKOUT_ERROR_COPY,
  checkoutPath,
  checkoutPrice,
  createIdempotencyKey,
  formatCheckoutAmount,
  parseCheckoutSelection,
  startCardCheckout,
  startCryptoCheckout,
  type BillingPeriod,
  type CheckoutMethod,
  type CheckoutSelection,
  type PaidPlanKey,
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
    value: 'card',
    title: 'Card',
    description: 'Visa, Mastercard, American Express and more, through Stripe.',
    Icon: CreditCard,
  },
  {
    value: 'crypto',
    title: 'Crypto',
    description: 'USDC on Base, approved in your wallet.',
    Icon: Wallet,
  },
];

type Notice = { tone: 'error' | 'info'; text: string } | null;

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
  const config = useConfig();
  const { address } = useAccount();
  const { session } = useSiwe();
  const { ensureBaseChain } = useBaseChainGuard();
  const signedIn = Boolean(
    session.authenticated && address && session.address?.toLowerCase() === address.toLowerCase(),
  );

  const [method, setMethod] = useState<CheckoutMethod>('card');
  const [phase, setPhase] = useState<'idle' | 'working' | 'redirecting'>('idle');
  const [notice, setNotice] = useState<Notice>(
    canceled ? { tone: 'info', text: 'Payment canceled. Nothing was charged.' } : null,
  );
  /** One key per attempt: a retry of the same plan, period and method reuses it. */
  const attemptKey = useRef<string | null>(null);
  const busy = useRef(false);

  // A different plan, period or method is a new attempt with a new key.
  useEffect(() => {
    attemptKey.current = null;
  }, [method, selection.sku, selection.period]);

  const price = checkoutPrice(selection);
  const total = formatCheckoutAmount(price.amountAtomic);
  const entry = SERVICE_PLAN_CATALOG[selection.plan];
  const Icon = PLAN_ICONS[selection.plan];
  const periodLabel = selection.period === 'monthly' ? 'month' : 'year';
  const working = phase !== 'idle';

  async function pay() {
    if (busy.current) return;
    if (!signedIn || !address) {
      setNotice({ tone: 'error', text: 'Sign in to continue. Nothing was charged.' });
      return;
    }
    busy.current = true;
    setNotice(null);
    setPhase('working');
    attemptKey.current ??= createIdempotencyKey();
    const key = attemptKey.current;
    try {
      if (method === 'card') {
        const { checkoutUrl } = await startCardCheckout(selection, key);
        setPhase('redirecting');
        window.location.assign(checkoutUrl);
        return;
      }
      if (!(await ensureBaseChain())) {
        setPhase('idle');
        return;
      }
      const signer = await getWalletClient(config, {
        account: address as Address,
        chainId: base.id,
      });
      if (!signer?.account) throw new CheckoutError('unavailable');
      const { checkoutId } = await startCryptoCheckout(selection, key, (requirement) =>
        createX402PaymentHeaders(requirement, signer),
      );
      setPhase('redirecting');
      router.push(`/checkout/complete?checkout=${encodeURIComponent(checkoutId)}`);
    } catch (error) {
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
    } finally {
      busy.current = false;
    }
  }

  const payLabel =
    phase === 'redirecting'
      ? method === 'card'
        ? 'Opening secure payment…'
        : 'Confirming payment…'
      : phase === 'working'
        ? method === 'card'
          ? 'Preparing payment…'
          : 'Waiting for your wallet…'
        : method === 'card'
          ? 'Continue to payment'
          : `Pay ${total} with USDC`;

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
          <div className="flex items-baseline justify-between gap-4 border-t border-border/70 pt-3">
            <dt className="font-semibold">Total due today</dt>
            <dd className="font-mono text-xl font-bold" aria-live="polite">
              {total}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {total} per {periodLabel}. Prices are in US dollars; crypto payments are made in USDC on
          Base, where 1 USDC equals 1 US dollar.
        </p>
      </section>

      {/* Account and payment. */}
      <section aria-labelledby="checkout-payment" className="lg:order-1">
        <div className="premium-surface rounded-2xl border p-5 sm:p-6">
          <h2 id="checkout-payment" className="sr-only">
            Payment
          </h2>

          <StepHeading index={1} title="Account" />
          {signedIn && address ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/70 bg-background/50 px-4 py-3">
              <CircleCheck className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-medium">Signed in</div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {shortAddress(address, 6)}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">
                Sign in so the plan is added to your account.
              </p>
              <HeaderAccountButton
                size="lg"
                destination={null}
                prepare={ensureBaseChain}
                showAccount={false}
                showError
                className="w-full sm:w-auto"
              />
            </div>
          )}

          <div className="my-6 border-t border-border/70" />

          <StepHeading index={2} title="Payment method" />
          <MethodPicker value={method} onChange={setMethod} disabled={working} />

          {notice ? (
            <InlineNotice tone={notice.tone} className="mt-5">
              {notice.text}
            </InlineNotice>
          ) : null}

          <Button
            type="button"
            size="lg"
            onClick={() => void pay()}
            disabled={!signedIn || working}
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
          {!signedIn ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Sign in above to continue.
            </p>
          ) : null}

          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {method === 'card'
              ? "You pay on Stripe's secure page. OpenSignet never sees or stores your card details."
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
}: {
  value: CheckoutMethod;
  onChange: (value: CheckoutMethod) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + METHODS.length) % METHODS.length;
    const method = METHODS[next];
    if (!method) return;
    onChange(method.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Payment method" className="mt-3 grid gap-3 sm:grid-cols-2">
      {METHODS.map(({ value: option, title, description, Icon }, index) => {
        const selected = option === value;
        return (
          <button
            key={option}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'relative flex items-start gap-3 rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-70',
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
              <span className="block text-sm font-semibold">{title}</span>
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
