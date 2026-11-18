'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, LoaderCircle, LockKeyhole, LogIn, RefreshCw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Why management is not shown yet:
 * - `checking`: reading the session or asking the API whether this account owns the identity;
 * - `signed-out`: nobody is signed in;
 * - `not-owner`: the signed-in account does not own this identity;
 * - `unavailable`: the API could not answer.
 */
export type ManagementAccess = 'checking' | 'signed-out' | 'not-owner' | 'unavailable';

const COPY: Record<Exclude<ManagementAccess, 'checking'>, { title: string; body: string }> = {
  'signed-out': {
    title: 'Sign in to manage this identity',
    body: 'DNS, email, renewal, plan and API key settings appear here for the account that owns it.',
  },
  // Same answer whether the identity is someone else's or does not exist: never confirm either.
  'not-owner': {
    title: 'This identity isn’t in your account',
    body: 'Check the link, or sign in with the account that holds it. If you hold it with a wallet, link that wallet to this account.',
  },
  unavailable: {
    title: 'Management is unavailable right now',
    body: 'We couldn’t load the settings for this identity. Nothing has changed; try again in a moment.',
  },
};

export function OwnerManagementGate({
  access,
  onRetry,
}: {
  access: ManagementAccess;
  onRetry: () => void;
}) {
  const [signInHref, setSignInHref] = useState('/sign-in');
  useEffect(() => {
    setSignInHref(
      `/sign-in?return_to=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
    );
  }, []);

  if (access === 'checking') {
    return (
      <Card className="premium-surface" aria-busy="true">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground sm:p-6">
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          <span role="status">Checking your access…</span>
        </CardContent>
      </Card>
    );
  }

  const copy = COPY[access];
  const Icon = access === 'unavailable' ? AlertTriangle : LockKeyhole;

  return (
    <Card className="premium-surface border-primary/20">
      <CardContent className="p-4 sm:p-6">
        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          role={access === 'unavailable' ? 'alert' : undefined}
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Icon
                className={`h-5 w-5 ${access === 'unavailable' ? 'text-destructive' : 'text-muted-foreground'}`}
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold">{copy.title}</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{copy.body}</p>
            </div>
          </div>

          {access === 'signed-out' ? (
            <Button asChild className="w-full sm:w-auto">
              <Link href={signInHref}>
                <LogIn className="h-4 w-4" aria-hidden />
                Sign in
              </Link>
            </Button>
          ) : access === 'not-owner' ? (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/settings/security#sign-in-methods">
                <Wallet className="h-4 w-4" aria-hidden />
                Link a wallet
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className="w-full sm:w-auto" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
