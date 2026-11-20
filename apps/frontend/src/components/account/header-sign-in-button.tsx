'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccountSession } from '@/hooks/use-account-session';
import { cn } from '@/lib/utils';

/**
 * The header account control. Signed out it opens the sign-in page and brings the person back to
 * the page they were on; signed in it is the dashboard link. While the session is being read it
 * keeps the same footprint, so the label never flashes.
 */
export function HeaderSignInButton({
  className,
  fullWidth = false,
  onNavigate,
}: {
  className?: string;
  fullWidth?: boolean;
  onNavigate?: () => void;
}) {
  const session = useAccountSession();
  const [href, setHref] = useState('/sign-in');

  useEffect(() => {
    const here = `${window.location.pathname}${window.location.search}`;
    if (here !== '/' && !here.startsWith('/sign-in')) {
      setHref(`/sign-in?return_to=${encodeURIComponent(here)}`);
    }
  }, []);

  const width = fullWidth ? 'w-full' : 'min-w-[7.75rem]';

  if (session.status === 'loading') {
    return (
      <span
        className={cn(
          'inline-flex h-10 animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none',
          width,
          className,
        )}
        aria-hidden
      />
    );
  }

  if (session.status === 'signed-in') {
    return (
      <Button
        asChild
        size="sm"
        className={cn(
          width,
          // The one clear way on, in the header and the phone menu: dark, with a soft top light.
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_14px_28px_-20px_rgba(20,21,18,0.75)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_18px_34px_-22px_rgba(20,21,18,0.85)]',
          className,
        )}
      >
        <Link href="/dashboard" onClick={() => onNavigate?.()}>
          <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          Dashboard
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild size="sm" className={cn(width, className)}>
      <Link href={href} onClick={() => onNavigate?.()}>
        <LogIn className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        Sign in
      </Link>
    </Button>
  );
}
