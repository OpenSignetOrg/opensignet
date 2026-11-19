'use client';

import { useEffect, useRef, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface PageTab {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

/**
 * Section tabs under a page heading: an underlined tab bar that scrolls sideways on phones and keeps
 * the current tab in view. Each tab is its own page, so links, history and reloads all work.
 */
export function PageTabs({ tabs, label }: { tabs: readonly PageTab[]; label: string }) {
  const pathname = usePathname()?.replace(/\/$/, '') ?? '';
  const list = useRef<HTMLUListElement>(null);
  // The longest matching href is current, so `/x` is not current on `/x/dns`.
  const current = tabs
    .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  useEffect(() => {
    const active = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  return (
    <nav aria-label={label} className="-mx-4 mb-8 border-b border-border/80 sm:mx-0">
      <ul
        ref={list}
        className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(({ href, label: text, icon: Icon }) => {
          const active = href === current;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative -mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
                  active
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
