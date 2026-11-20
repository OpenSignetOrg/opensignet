'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { useSiwe } from '@/hooks/use-siwe';
import { cn } from '@/lib/utils';
import { ConnectWalletButton } from './connect-wallet-button';

/**
 * The single account control. Signed out (wallet connected or not) it reads "Sign in" and runs
 * the wallet + SIWE flow, then opens `destination`; signed in it is only the dashboard link
 * (signing out lives inside the dashboard). While the wallet or session is still resolving it reserves
 * the same footprint, so the label never flashes.
 */
export function HeaderAccountButton({
  className,
  fullWidth = false,
  onNavigate,
  destination = '/dashboard',
  prepare,
  size = 'sm',
  showAccount = true,
  showError = false,
}: {
  className?: string;
  fullWidth?: boolean;
  onNavigate?: () => void;
  /** Where to go after a successful sign-in; `null` stays on the current page. */
  destination?: string | null;
  /** Runs before the signature request, e.g. switching to Base; returning false stops sign-in. */
  prepare?: () => Promise<boolean>;
  size?: 'sm' | 'lg';
  /** Signed in, show the dashboard link (the header); off elsewhere. */
  showAccount?: boolean;
  /** Show why the last sign-in attempt failed, under the button (full-page sign-in). */
  showError?: boolean;
}) {
  const router = useRouter();
  const { address, isConnected, status } = useAccount();
  const { session, signIn, loading, checking, error } = useSiwe();
  const [mounted, setMounted] = useState(false);
  const [wantsSignIn, setWantsSignIn] = useState(false);
  const attempted = useRef<string | null>(null);
  // Errors belong to an attempt the person made here, never to the background session check.
  const [tried, setTried] = useState(false);

  useEffect(() => setMounted(true), []);

  const signedIn = Boolean(
    session.authenticated && address && session.address?.toLowerCase() === address.toLowerCase(),
  );
  const resolving =
    !mounted || status === 'reconnecting' || status === 'connecting' || (isConnected && checking);

  // After the wallet connects from "Sign in", continue straight into the SIWE signature.
  useEffect(() => {
    if (!wantsSignIn || !isConnected || !address || checking || loading) return;
    const finish = () => {
      onNavigate?.();
      if (destination) router.push(destination);
    };
    if (signedIn) {
      setWantsSignIn(false);
      finish();
      return;
    }
    if (attempted.current === address) return;
    attempted.current = address;
    void (async () => {
      const ready = prepare ? await prepare().catch(() => false) : true;
      const ok = ready && (await signIn());
      setWantsSignIn(false);
      if (ok) finish();
      else setTried(true);
    })();
  }, [
    wantsSignIn,
    isConnected,
    address,
    checking,
    loading,
    signedIn,
    signIn,
    router,
    onNavigate,
    destination,
    prepare,
  ]);

  // In the header the failure reason appears as a toast, so the bar keeps its layout.
  useEffect(() => {
    if (showError || !tried || !error) return;
    toast.error('Sign-in did not complete', { id: 'sign-in-error', description: error });
    setTried(false);
  }, [showError, tried, error]);

  const width = fullWidth ? 'w-full' : size === 'lg' ? 'min-w-[10rem]' : 'min-w-[7.75rem]';
  const height = size === 'lg' ? 'h-11 px-6 text-[15px]' : undefined;

  if (resolving) {
    return (
      <span
        className={cn(
          'inline-flex animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none',
          size === 'lg' ? 'h-11' : 'h-9',
          width,
          className,
        )}
        aria-hidden
      />
    );
  }

  if (signedIn) {
    if (!showAccount) return null;
    return (
      <Button
        asChild
        variant={fullWidth ? 'secondary' : 'outline'}
        size="sm"
        className={cn(width, className)}
      >
        <Link href="/dashboard" onClick={() => onNavigate?.()}>
          <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          Dashboard
        </Link>
      </Button>
    );
  }

  const control = !isConnected ? (
    <ConnectWalletButton
      label="Sign in"
      icon={<LogIn className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />}
      variant="default"
      size="sm"
      className={cn(width, height, className)}
      wrapperClassName={fullWidth ? 'w-full' : undefined}
      onOpen={() => {
        attempted.current = null;
        setWantsSignIn(true);
      }}
    />
  ) : (
    <Button
      type="button"
      size="sm"
      className={cn(width, height, className)}
      disabled={loading}
      onClick={() => {
        attempted.current = null;
        setWantsSignIn(true);
      }}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <LogIn className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      )}
      {loading ? 'Check your wallet' : 'Sign in'}
    </Button>
  );

  if (!showError || !tried || !error || loading) return control;
  return (
    <div className="flex w-full flex-col items-center gap-4">
      {control}
      <InlineNotice className="max-w-sm">{error}</InlineNotice>
    </div>
  );
}
