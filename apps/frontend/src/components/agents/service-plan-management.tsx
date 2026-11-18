'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useManagementSession } from '@/components/agents/management-session';
import {
  AccountPlanError,
  fetchAccountPlan,
  identityPlanSchema,
  planName,
  type AccountPlan,
  type IdentityPlan,
} from '@/lib/account-plan';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';
import { cn, formatDate } from '@/lib/utils';

/**
 * The plan on an identity page. Plans belong to the account, so this shows the account's plan,
 * and what it gives this identity. Buying or changing a plan happens on the pricing page and
 * checkout, never here.
 */
export function ServicePlanManagement({ agentId }: { agentId: string }) {
  const { signedIn, sessionEnded } = useManagementSession();
  const [account, setAccount] = useState<AccountPlan | null>(null);
  const [identity, setIdentity] = useState<IdentityPlan | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setState('loading');
      try {
        const [plan, response] = await Promise.all([
          fetchAccountPlan(signal),
          fetch(`/api/v1/agents/${encodeURIComponent(agentId)}/plan`, {
            credentials: 'include',
            cache: 'no-store',
            signal: AbortSignal.any([signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
          }),
        ]);
        if (response.status === 401) throw new AccountPlanError('signed-out');
        if (!response.ok) throw new AccountPlanError('unavailable');
        const parsed = identityPlanSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) throw new AccountPlanError('unavailable');
        if (signal.aborted) return;
        setAccount(plan);
        setIdentity(parsed.data);
        setState('ready');
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof AccountPlanError && error.kind === 'signed-out') sessionEnded();
        setState('error');
      }
    },
    [agentId, sessionEnded],
  );

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, signedIn, attempt]);

  const free = account?.plan === 'included';
  const limits = identity?.entitlement.limits;

  return (
    <Card className="premium-surface mb-6 min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CreditCard className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            Plan
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Your plan covers your whole account, including this identity.
          </p>
        </div>
        <Button asChild variant={free ? 'default' : 'outline'} className="w-full sm:w-auto">
          <Link href="/pricing">
            {free ? 'Upgrade' : 'Change plan'}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 px-4 pb-4 pt-0 sm:gap-5 sm:px-6 sm:pb-6">
        {state === 'error' ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/45 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
          >
            <span>We couldn’t load your plan. Nothing has changed.</span>
            <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </Button>
          </div>
        ) : state === 'loading' || !account || !limits ? (
          <div
            className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
            aria-busy="true"
          >
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            <span role="status">Loading your plan…</span>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <span className="text-lg font-semibold">{planName(account.plan, account.sku)}</span>
              {account.status === 'past_due' ? (
                <Badge variant="destructive">Payment due</Badge>
              ) : account.cancelAtPeriodEnd ? (
                <Badge variant="outline">Ends at period end</Badge>
              ) : null}
              {account.currentPeriodEnd ? (
                <span className="text-muted-foreground">
                  {account.cancelAtPeriodEnd ? 'Ends' : 'Renews'}{' '}
                  {formatDate(account.currentPeriodEnd)}
                  {account.period ? ` · billed ${account.period}` : ''}
                </span>
              ) : null}
            </div>

            <dl className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              <Limit
                label="Email / month"
                value={`${limits.monthlyEmails.toLocaleString('en-US')}`}
                hint="sent and received"
              />
              <Limit label="API keys" value={String(limits.apiKeys)} />
              <Limit label="DNS records" value={String(limits.dnsRecords)} />
              <Limit
                label="Email aliases"
                value={limits.emailAliases ? String(limits.emailAliases) : 'None'}
              />
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Limit({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cn('min-w-0 rounded-lg border border-border/60 bg-background/45 p-3')}>
      <dt className="text-xs leading-4 text-muted-foreground">
        {label}
        {hint ? <span className="sr-only"> ({hint})</span> : null}
      </dt>
      <dd className="mt-1 break-words font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
