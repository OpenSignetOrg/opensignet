'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  CreditCard,
  LayoutGrid,
  LifeBuoy,
  Loader2,
  LogOut,
  Menu,
  Plus,
  RotateCw,
  Settings,
  Wallet,
  X,
} from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { SignInGate } from '@/components/account/sign-in-gate';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { useSiwe } from '@/hooks/use-siwe';
import { cn } from '@/lib/utils';
import { ConsoleProvider, useConsole, type ConsoleIdentity } from './console-context';
import { IdentityTile, StatusDot } from './identity-bits';

const DOCS_URL = 'https://docs.opensignet.com';
/** Identities listed in the sidebar before "View all". */
const SIDEBAR_IDENTITIES = 8;

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Paths that also mark this item as the current page. */
  match: (path: string) => boolean;
}

const ACCOUNT_NAV: readonly NavItem[] = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: LayoutGrid,
    match: (path) => path === '/dashboard',
  },
  {
    href: '/dashboard/billing',
    label: 'Billing',
    icon: CreditCard,
    match: (path) => path.startsWith('/dashboard/billing'),
  },
  {
    href: '/settings/wallet',
    label: 'Wallet',
    icon: Wallet,
    match: (path) => path.startsWith('/settings/wallet'),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    match: (path) => path === '/settings' || path.startsWith('/settings/security'),
  },
];

/**
 * The signed-in console: a sidebar (account pages, the account's identities, help and the account
 * menu) beside a raised content panel. Below 1024px the sidebar becomes a drawer opened from a
 * compact top bar. Signed-out visitors see the sign-in step instead, never an empty console.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <ConsoleProvider>
      <ConsoleFrame>{children}</ConsoleFrame>
    </ConsoleProvider>
  );
}

function ConsoleFrame({ children }: { children: ReactNode }) {
  const { state, refresh } = useConsole();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname()?.replace(/\/$/, '') || '/dashboard';

  useEffect(() => setDrawerOpen(false), [pathname]);

  if (state.status === 'signed-out') {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <BareTopBar />
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
          <SignInGate
            title="Sign in to your dashboard"
            description="Your identities, inboxes, DNS and billing are private to your account."
            points={[
              'Every identity you own, with its email, DNS and API keys',
              'Purchases tracked while they are being set up',
              'Plans, renewals and your OpenSignet wallet in one place',
            ]}
          />
        </main>
      </div>
    );
  }

  if (state.status === 'loading') return <ConsoleSkeleton />;

  if (state.status === 'wallet-pending' || state.status === 'unavailable') {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <BareTopBar />
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="console-panel w-full max-w-md rounded-2xl p-6 text-center sm:p-8">
            <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/80 bg-background/60">
              {state.status === 'wallet-pending' ? (
                <Wallet className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              ) : (
                <RotateCw className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              )}
            </span>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">
              {state.status === 'wallet-pending'
                ? 'Setting up your wallet'
                : 'Your account couldn’t be loaded'}
            </h1>
            <p
              role="status"
              className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground"
            >
              {state.status === 'wallet-pending'
                ? 'Every OpenSignet account comes with its own wallet on Base. This takes a moment.'
                : 'Check your connection and try again. Nothing has changed.'}
            </p>
            {state.status === 'wallet-pending' ? (
              <Loader2
                className="mx-auto mt-5 h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none"
                aria-hidden
              />
            ) : (
              <Button type="button" variant="outline" className="mt-5" onClick={refresh}>
                <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Try again
              </Button>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a
        href="#console-main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <aside
        aria-label="Dashboard"
        className="sticky top-0 hidden h-dvh flex-col overflow-y-auto px-3 pb-3 pt-4 lg:flex"
      >
        <SidebarContent pathname={pathname} />
      </aside>

      <MobileTopBar onOpen={() => setDrawerOpen(true)} />
      {drawerOpen ? (
        <Drawer onClose={() => setDrawerOpen(false)}>
          <SidebarContent pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
        </Drawer>
      ) : null}

      <div className="min-w-0 lg:py-2 lg:pr-2">
        <main
          id="console-main"
          tabIndex={-1}
          className="console-main min-h-[calc(100dvh-56px)] min-w-0 outline-none lg:console-panel lg:min-h-[calc(100dvh-16px)] lg:rounded-2xl"
        >
          <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { state, identities } = useConsole();
  const account = state.status === 'ready' ? state.account : null;
  const identityId = pathname.match(/^\/dashboard\/identities\/([^/]+)/)?.[1];
  const items = identities.status === 'ready' ? identities.items : [];
  const shown = items.slice(0, SIDEBAR_IDENTITIES);
  // Keep the open identity visible even when it is beyond the first few.
  const current = identityId
    ? items.find((item) => item.id === decodeURIComponent(identityId))
    : undefined;
  if (current && !shown.includes(current)) shown.push(current);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex h-9 items-center justify-between px-2">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <BrandMark className="h-[20px] sm:h-[20px]" />
          OpenSignet
        </Link>
      </div>

      <Button
        asChild
        className="mt-5 h-9 w-full justify-center gap-2 rounded-lg text-[13.5px] shadow-sm"
      >
        <Link href="/register" onClick={onNavigate}>
          <Plus className="h-4 w-4" aria-hidden />
          Get a domain
        </Link>
      </Button>

      <nav aria-label="Account" className="mt-5">
        <ul className="flex flex-col gap-0.5">
          {ACCOUNT_NAV.map((item) => (
            <li key={item.href}>
              <SidebarLink
                href={item.href}
                active={item.match(pathname)}
                onNavigate={onNavigate}
                icon={<item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
              >
                {item.label}
              </SidebarLink>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-labelledby="sidebar-identities" className="mt-6">
        <div className="flex items-center justify-between px-2.5 pb-1.5">
          <h2
            id="sidebar-identities"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80"
          >
            Identities
          </h2>
          {identities.status === 'ready' && items.length > 0 ? (
            <span className="text-[11px] tabular-nums text-muted-foreground/80">
              {items.length}
            </span>
          ) : null}
        </div>
        {identities.status === 'loading' ? (
          <div className="flex flex-col gap-1.5 px-2.5 py-1" aria-hidden>
            {[0, 1].map((key) => (
              <div
                key={key}
                className="h-7 animate-pulse rounded-md bg-foreground/[0.05] motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : identities.status === 'error' ? (
          <p className="px-2.5 py-1 text-[13px] leading-5 text-muted-foreground">
            Your identities couldn’t be loaded.
          </p>
        ) : items.length === 0 ? (
          <p className="px-2.5 py-1 text-[13px] leading-5 text-muted-foreground">
            No identities yet. Your first domain appears here.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shown.map((identity) => (
              <li key={identity.id}>
                <IdentityLink
                  identity={identity}
                  active={
                    identityId !== undefined && decodeURIComponent(identityId) === identity.id
                  }
                  onNavigate={onNavigate}
                />
              </li>
            ))}
            {items.length > shown.length ? (
              <li>
                <Link
                  href="/dashboard#identities"
                  onClick={onNavigate}
                  className="flex h-8 items-center rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  View all {items.length}
                </Link>
              </li>
            ) : null}
          </ul>
        )}
      </nav>

      <div className="mt-auto pt-6">
        <ul className="flex flex-col gap-0.5">
          <li>
            <SidebarLink
              href={DOCS_URL}
              external
              icon={<BookOpen className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
            >
              Documentation
            </SidebarLink>
          </li>
          <li>
            <SidebarLink
              href="/support"
              active={false}
              onNavigate={onNavigate}
              icon={<LifeBuoy className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
            >
              Support
            </SidebarLink>
          </li>
        </ul>
        {account ? (
          <AccountRow
            name={account.displayName}
            email={account.email}
            avatar={account.avatar.url}
          />
        ) : null}
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  active = false,
  external = false,
  icon,
  onNavigate,
  children,
}: {
  href: string;
  active?: boolean;
  external?: boolean;
  icon: ReactNode;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const className = cn(
    'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
    active
      ? 'console-nav-active text-foreground'
      : 'text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground',
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      {icon}
      {children}
    </Link>
  );
}

function IdentityLink({
  identity,
  active,
  onNavigate,
}: {
  identity: ConsoleIdentity;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={`/dashboard/identities/${encodeURIComponent(identity.id)}`}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 min-w-0 items-center gap-2.5 rounded-lg px-2 text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        active
          ? 'console-nav-active text-foreground'
          : 'text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground',
      )}
    >
      <IdentityTile domain={identity.domain} size="sm" />
      <span className="min-w-0 flex-1 truncate">{identity.domain}</span>
      <StatusDot status={identity.status} />
    </Link>
  );
}

function AccountRow({
  name,
  email,
  avatar,
}: {
  name: string | null;
  email: string | null;
  avatar: string | null;
}) {
  const { signOut, loading, error } = useSiwe();
  const [tried, setTried] = useState(false);
  const label = name || email || 'Your account';
  return (
    <div className="mt-3 border-t border-border/70 pt-3">
      <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- the account photo comes from our own API.
          <img
            src={avatar}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border border-border/70 object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/80 bg-card text-[13px] font-semibold uppercase"
          >
            {label.charAt(0)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-5">{label}</div>
          {name && email ? (
            <div className="truncate text-[12px] leading-4 text-muted-foreground">{email}</div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          disabled={loading}
          onClick={() => {
            setTried(true);
            void signOut();
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>
      {tried && error && !loading ? <InlineNotice className="mt-2">{error}</InlineNotice> : null}
    </div>
  );
}

function MobileTopBar({ onOpen }: { onOpen: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-background/90 px-2 backdrop-blur-md sm:px-4 lg:hidden">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onOpen}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight"
      >
        <BrandMark className="h-[20px] sm:h-[20px]" />
        OpenSignet
      </Link>
      <Button asChild size="sm" className="ml-auto h-9 rounded-lg px-3">
        <Link href="/register" aria-label="Get a domain">
          <Plus className="h-4 w-4" aria-hidden />
          <span className="hidden min-[400px]:inline">Get a domain</span>
        </Link>
      </Button>
    </header>
  );
}

function BareTopBar() {
  return (
    <header className="flex h-14 items-center px-4 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight"
      >
        <BrandMark className="h-[20px] sm:h-[20px]" />
        OpenSignet
      </Link>
    </header>
  );
}

/** The sidebar as a drawer below 1024px: Escape, backdrop and navigation close it; focus stays inside. */
function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.querySelector<HTMLElement>('button, a[href]')?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-[hsl(90_5%_12%/0.28)] backdrop-blur-[2px] animate-in fade-in-0 duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-[296px] max-w-[86vw] flex-col overflow-y-auto border-r border-border/80 bg-background px-3 pb-3 pt-4 shadow-2xl animate-in fade-in-0 slide-in-from-left-8 duration-200 motion-reduce:animate-none"
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="absolute right-2 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ConsoleSkeleton() {
  return (
    <div
      className="min-h-dvh bg-background lg:grid lg:grid-cols-[264px_minmax(0,1fr)]"
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        Loading your dashboard
      </span>
      <div className="hidden flex-col gap-2 px-5 pt-5 lg:flex">
        <div className="h-6 w-32 rounded-md bg-foreground/[0.06]" />
        <div className="mt-4 h-9 rounded-lg bg-foreground/[0.06]" />
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="mt-1 h-8 rounded-lg bg-foreground/[0.04]" />
        ))}
      </div>
      <div className="h-14 border-b border-border/70 lg:hidden" />
      <div className="lg:py-2 lg:pr-2">
        <div className="min-h-[calc(100dvh-56px)] lg:console-panel lg:min-h-[calc(100dvh-16px)] lg:rounded-2xl">
          <div className="mx-auto max-w-[1120px] px-4 pt-8 sm:px-6 lg:px-10 lg:pt-10">
            <div className="h-8 w-48 animate-pulse rounded-md bg-foreground/[0.06] motion-reduce:animate-none" />
            <div className="mt-8 h-28 animate-pulse rounded-xl bg-foreground/[0.04] motion-reduce:animate-none" />
            <div className="mt-6 h-64 animate-pulse rounded-xl bg-foreground/[0.04] motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
