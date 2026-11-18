/* eslint-disable @next/next/no-html-link-for-pages -- Public pages use full navigation to avoid shipping router JavaScript. */

import { ChevronRight, Menu, X } from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { HeaderSignInButton } from '@/components/account/header-sign-in-button';
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

/** Server-rendered header for public pages; `current` is the page's pathname. */
export function PublicNav({ current }: { current?: string } = {}) {
  return (
    <header
      style={{ top: 0 }}
      className="opensignet-sticky-header sticky z-40 w-full border-b border-border/80 backdrop-blur-[12px] md:backdrop-blur-xl"
    >
      <div className="container relative flex h-16 items-center justify-between gap-3 md:grid md:grid-cols-[1fr_auto_1fr]">
        <a href="/" className="flex min-w-0 items-center gap-2.5" aria-label="OpenSignet home">
          <BrandMark />
          <span className="truncate text-base font-bold tracking-tight sm:text-lg">OpenSignet</span>
        </a>

        <nav
          className="hidden items-center gap-0.5 md:flex lg:gap-1 2xl:gap-2"
          aria-label="Primary navigation"
        >
          {PRIMARY_NAV_LINKS.map((link) => {
            const { href, label, icon: Icon } = link;
            return (
              <a
                key={href}
                href={href}
                aria-current={isCurrentNavLink(link, current) ? 'page' : undefined}
                className={`group/nav ${desktopNavLinkClass}`}
              >
                <Icon className={desktopNavIconClass} strokeWidth={1.75} aria-hidden />
                {label}
              </a>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 md:justify-self-end">
          <SiteSearchButton />
          <div className="hidden items-center md:flex">
            <HeaderSignInButton className="h-10 px-4" />
          </div>

          <details className="group static md:hidden">
            <summary className="flex h-10 w-10 shrink-0 cursor-pointer list-none items-center justify-center rounded-md border border-border/80 bg-card/70 text-foreground/80 shadow-sm transition hover:border-[hsl(var(--brand-orange)/0.45)] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 marker:content-none">
              <Menu className="h-5 w-5 group-open:hidden" aria-hidden />
              <X className="hidden h-5 w-5 group-open:block" aria-hidden />
              <span className="sr-only group-open:hidden">Open navigation</span>
              <span className="sr-only hidden group-open:inline">Close navigation</span>
            </summary>
            <div className="safe-x absolute left-0 right-0 top-full z-50 border-b border-border/90 bg-card p-3 shadow-[0_22px_48px_-34px_rgba(20,21,18,0.5)] sm:p-4">
              <nav className="grid gap-0.5" aria-label="Mobile navigation">
                {PRIMARY_NAV_LINKS.map((link) => {
                  const { href, label, icon: Icon } = link;
                  return (
                    <a
                      key={href}
                      href={href}
                      aria-current={isCurrentNavLink(link, current) ? 'page' : undefined}
                      className={mobileNavLinkClass}
                    >
                      <Icon className={navIconClass} strokeWidth={1.75} aria-hidden />
                      {label}
                      <ChevronRight className={navChevronClass} strokeWidth={1.75} aria-hidden />
                    </a>
                  );
                })}
              </nav>
              <div className="mt-3 grid gap-3 border-t border-border/40 pt-4">
                <HeaderSignInButton fullWidth className="h-11" />
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
