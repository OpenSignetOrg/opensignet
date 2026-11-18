'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CircleCheck, CircleX, Clock, Loader2 } from 'lucide-react';
import { SERVICE_PLAN_CATALOG } from '@opensignet/shared';
import { Button } from '@/components/ui/button';
import {
  CheckoutError,
  checkoutPath,
  getCheckoutStatus,
  isCheckoutId,
  parseCheckoutSelection,
  type CheckoutStatusResult,
} from '@/lib/checkout';

/** How long the page keeps checking before it says the confirmation is taking longer. */
const CONFIRM_WINDOW_MS = 90_000;
const FIRST_DELAY_MS = 1_500;
const MAX_DELAY_MS = 6_000;

type View =
  | { state: 'checking' }
  | { state: 'paid'; result: CheckoutStatusResult }
  | { state: 'failed'; result: CheckoutStatusResult }
  | { state: 'slow' }
  | { state: 'signin' }
  | { state: 'missing' }
  | { state: 'unavailable' };

/**
 * After payment: reads the checkout status from the server and only then says the plan is active.
 * Nothing in the address bar is trusted beyond a validated checkout reference.
 */
export function CheckoutCompleteClient() {
  const params = useSearchParams();
  const checkoutId = params.get('checkout');
  const validId = isCheckoutId(checkoutId) ? checkoutId : null;
  const [view, setView] = useState<View>(validId ? { state: 'checking' } : { state: 'missing' });

  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    const started = Date.now();
    let timer: number | undefined;
    let delay = FIRST_DELAY_MS;

    const check = async () => {
      try {
        const result = await getCheckoutStatus(validId, controller.signal);
        if (controller.signal.aborted) return;
        if (result.status === 'paid') return setView({ state: 'paid', result });
        if (result.status !== 'pending') return setView({ state: 'failed', result });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof CheckoutError && error.kind === 'signin') {
          return setView({ state: 'signin' });
        }
        if (error instanceof CheckoutError && error.kind === 'invalid') {
          return setView({ state: 'missing' });
        }
        if (Date.now() - started > CONFIRM_WINDOW_MS) return setView({ state: 'unavailable' });
      }
      if (Date.now() - started > CONFIRM_WINDOW_MS) return setView({ state: 'slow' });
      timer = window.setTimeout(check, delay);
      delay = Math.min(MAX_DELAY_MS, Math.round(delay * 1.5));
    };
    void check();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [validId]);

  if (view.state === 'checking') {
    return (
      <Panel
        icon={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />}
        title="Confirming your payment"
        live
      >
        This usually takes a few seconds. Please keep this page open.
      </Panel>
    );
  }

  if (view.state === 'paid') {
    const label = SERVICE_PLAN_CATALOG[view.result.plan].label;
    return (
      <Panel
        icon={<CircleCheck className="h-7 w-7 text-emerald-700" aria-hidden />}
        title={`You are on ${label}`}
        live
        action={<ActionLink href="/dashboard">Go to dashboard</ActionLink>}
      >
        Payment confirmed. Your {label} plan is active on your account and billed{' '}
        {view.result.period}.
      </Panel>
    );
  }

  if (view.state === 'failed') {
    const retry = parseCheckoutSelection(view.result.planSku, view.result.period);
    const canceled = view.result.status === 'canceled';
    return (
      <Panel
        icon={<CircleX className="h-7 w-7 text-destructive" aria-hidden />}
        title={canceled ? 'Payment canceled' : 'Payment did not go through'}
        live
        action={
          <ActionLink href={retry ? checkoutPath(retry) : '/pricing'}>
            {retry ? 'Try again' : 'See plans'}
          </ActionLink>
        }
      >
        Nothing was charged. You can start a new checkout at any time.
      </Panel>
    );
  }

  if (view.state === 'slow') {
    return (
      <Panel
        icon={<Clock className="h-7 w-7 text-muted-foreground" aria-hidden />}
        title="Still confirming your payment"
        action={<ActionLink href="/dashboard">Go to dashboard</ActionLink>}
      >
        This is taking longer than usual. You can leave this page: your plan is added to your
        account as soon as the payment is confirmed. Please do not pay again.
      </Panel>
    );
  }

  if (view.state === 'signin') {
    return (
      <Panel
        icon={<Clock className="h-7 w-7 text-muted-foreground" aria-hidden />}
        title="Sign in to see this payment"
        action={<ActionLink href="/dashboard">Go to dashboard</ActionLink>}
      >
        Your payment is linked to your account. Sign in on the dashboard to see your plan. Please do
        not pay again.
      </Panel>
    );
  }

  if (view.state === 'unavailable') {
    return (
      <Panel
        icon={<Clock className="h-7 w-7 text-muted-foreground" aria-hidden />}
        title="We could not confirm the payment yet"
        action={<ActionLink href="/support">Contact support</ActionLink>}
      >
        Payment status is not available right now. Please do not pay again. Check your dashboard
        later, or contact support with the reference{' '}
        <span className="font-mono text-foreground">{validId}</span>.
      </Panel>
    );
  }

  return (
    <Panel
      icon={<CircleX className="h-7 w-7 text-muted-foreground" aria-hidden />}
      title="We could not find this checkout"
      action={<ActionLink href="/pricing">See plans</ActionLink>}
    >
      This link is incomplete or has expired. Start again from the pricing page.
    </Panel>
  );
}

function Panel({
  icon,
  title,
  children,
  action,
  live,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  live?: boolean;
}) {
  return (
    <div
      role={live ? 'status' : undefined}
      className="premium-surface mx-auto max-w-lg rounded-2xl border p-6 text-center sm:p-8"
    >
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-background/60">
        {icon}
      </span>
      <h1 className="mt-4 text-balance text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{children}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild className="group/action">
      <Link href={href}>
        {children}
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover/action:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      </Link>
    </Button>
  );
}
