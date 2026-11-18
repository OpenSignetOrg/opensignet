'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HeaderSignInButton } from '@/components/account/header-sign-in-button';
import { ChevronRight, Menu, X } from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { SiteSearchButton } from '@/components/search/site-search-button';
import {
  PRIMARY_NAV_LINKS,
  desktopNavIconClass,
  desktopNavLinkClass,
  isCurrentNavLink,
  mobileNavLinkClass,
  navChevronClass,
  navIconClass,
} from './nav-links';

const WALLET_DIALOG_OPEN_ATTR = 'data-opensignet-wallet-dialog-open';
const WALLET_DIALOG_SELECTOR =
  '[data-opensignet-wallet-dialog="true"], [data-opensignet-wallet-menu="true"]';

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (isWalletDialogTarget(event.target)) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node | null)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <header
      style={{ top: 0 }}
      className="opensignet-sticky-header sticky z-40 w-full border-b border-border/80 backdrop-blur-[12px] md:backdrop-blur-xl"
    >
      <div
        ref={menuRef}
        className="container relative flex h-16 items-center justify-between gap-3 md:grid md:grid-cols-[1fr_auto_1fr]"
      >
        <Link href="/" className="flex min-w-0 items-center gap-2.5" onClick={() => setOpen(false)}>
          <BrandMark />
          <span className="truncate text-base font-bold tracking-tight sm:text-lg">OpenSignet</span>
        </Link>
        <nav
          className="hidden items-center gap-0.5 md:flex lg:gap-1 2xl:gap-2"
          aria-label="Primary navigation"
        >
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
        <div className="flex shrink-0 items-center gap-2 md:justify-self-end">
          <SiteSearchButton />
          <div className="hidden items-center md:flex">
            <HeaderSignInButton className="h-10 px-4" />
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/80 bg-card/70 text-foreground/80 shadow-sm transition hover:border-[hsl(var(--brand-orange)/0.45)] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 md:hidden"
            onClick={() => setOpen((next) => !next)}
            aria-expanded={open}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div
            data-opensignet-mobile-nav="true"
            className="safe-x absolute left-0 right-0 top-full z-50 border-b border-border/90 bg-card p-3 shadow-[0_22px_48px_-34px_rgba(20,21,18,0.5)] sm:p-4 md:hidden"
          >
            <nav className="grid gap-0.5" aria-label="Mobile navigation">
              <NavLinks onNavigate={() => setOpen(false)} mobile />
            </nav>
            <div className="mt-3 grid gap-3 border-t border-border/40 pt-4">
              <HeaderSignInButton fullWidth className="h-11" onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function isWalletDialogTarget(target: EventTarget | null): boolean {
  if (document.body.hasAttribute(WALLET_DIALOG_OPEN_ATTR)) return true;
  return target instanceof Element && Boolean(target.closest(WALLET_DIALOG_SELECTOR));
}

function NavLinks({ onNavigate, mobile }: { onNavigate: () => void; mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {PRIMARY_NAV_LINKS.map((link) => {
        const { href, label, icon: Icon } = link;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrentNavLink(link, pathname) ? 'page' : undefined}
            className={mobile ? mobileNavLinkClass : `group/nav ${desktopNavLinkClass}`}
            onClick={onNavigate}
          >
            <Icon
              className={mobile ? navIconClass : desktopNavIconClass}
              strokeWidth={1.75}
              aria-hidden
            />
            {label}
            {mobile ? (
              <ChevronRight className={navChevronClass} strokeWidth={1.75} aria-hidden />
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
