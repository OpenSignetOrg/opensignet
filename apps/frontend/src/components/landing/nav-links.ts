import { BookOpen, CircleDollarSign, Headset, UserRoundPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface PrimaryNavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pathname that marks this link as the current page. */
  match?: string;
}

/** The single primary navigation used by the public and application headers. */
export const PRIMARY_NAV_LINKS: readonly PrimaryNavLink[] = [
  { href: '/pricing', label: 'Pricing', icon: CircleDollarSign, match: '/pricing' },
  { href: '/register', label: 'Register', icon: UserRoundPlus, match: '/register' },
  { href: '/support', label: 'Support', icon: Headset, match: '/support' },
  { href: 'https://docs.opensignet.com', label: 'Docs', icon: BookOpen },
];

export function isCurrentNavLink(link: PrimaryNavLink, pathname: string | null | undefined) {
  return Boolean(
    link.match && pathname && (pathname === link.match || pathname.startsWith(`${link.match}/`)),
  );
}

/** Desktop header link: a real hit area, hover and pressed tints, and a brand-orange current mark. */
export const desktopNavLinkClass =
  'relative inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-2 text-[13.5px] lg:px-2.5 font-medium text-foreground/80 transition-colors hover:bg-accent/70 hover:text-foreground active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 aria-[current=page]:text-foreground aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-2 lg:aria-[current=page]:after:inset-x-2.5 aria-[current=page]:after:-bottom-[14px] aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-[hsl(var(--brand-orange))]';

/** Mobile menu row: at least 44px tall with a trailing chevron and a current-page bar. */
export const mobileNavLinkClass =
  'group/nav relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-foreground/85 transition-colors hover:bg-accent/80 hover:text-foreground active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 aria-[current=page]:bg-accent/70 aria-[current=page]:text-foreground aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2.5 aria-[current=page]:before:left-0 aria-[current=page]:before:w-[3px] aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-[hsl(var(--brand-orange))]';

/** Desktop link icons appear from 1024px; the 768-1023px bar shows labels only. */
export const desktopNavIconClass =
  'hidden h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover/nav:text-foreground lg:block';

export const navIconClass =
  'h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover/nav:text-foreground';
export const navChevronClass =
  'ml-auto h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover/nav:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/nav:translate-x-0';
