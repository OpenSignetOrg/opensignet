'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { KeyRound, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Full-page sign-in step for signed-in-only surfaces. Its one action opens the sign-in page, which
 * brings the person back here afterwards.
 */
export function SignInGate({
  title,
  description,
  points,
}: {
  title: string;
  description: ReactNode;
  points?: readonly string[];
}) {
  const [href, setHref] = useState('/sign-in');
  useEffect(() => {
    setHref(
      `/sign-in?return_to=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
    );
  }, []);

  return (
    <section
      aria-labelledby="sign-in-gate-title"
      data-sign-in-gate
      className="premium-surface mx-auto w-full max-w-lg rounded-2xl border px-5 py-8 text-center sm:px-10 sm:py-12"
    >
      <span
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border/80 bg-card text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
        aria-hidden
      >
        <KeyRound className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <h1 id="sign-in-gate-title" className="mt-5 text-xl font-semibold tracking-tight sm:text-2xl">
        {title}
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground sm:text-[15px]">
        {description}
      </p>
      {points?.length ? (
        <ul className="mx-auto mt-6 max-w-sm space-y-2.5 text-left text-sm leading-6 text-muted-foreground">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5">
              <span
                className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-orange))]"
                aria-hidden
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-8 flex justify-center">
        <Button
          asChild
          size="lg"
          className="h-11 w-full px-6 text-[15px] sm:w-auto sm:min-w-[10rem]"
        >
          <Link href={href}>
            <LogIn className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            Sign in
          </Link>
        </Button>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Continue with Google, an email code or a wallet.
      </p>
    </section>
  );
}
