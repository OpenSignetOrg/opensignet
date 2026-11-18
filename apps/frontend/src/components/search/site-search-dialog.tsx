'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Results use full navigation so every page, anchor and FAQ opens the same way. */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  CornerDownLeft,
  FileText,
  Hash,
  LoaderCircle,
  MessageCircleQuestion,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DOCS_ORIGIN,
  SITE_SEARCH_QUERY_MAX,
  highlightParts,
  parseSiteSearchIndex,
  prepareSiteSearch,
  searchSite,
  type PreparedSiteSearch,
  type SiteSearchEntry,
  type SiteSearchKind,
} from '@/lib/site-search';

const INDEX_URL = '/search-index.json';

let indexPromise: Promise<PreparedSiteSearch> | null = null;

/** Downloads the static index once per page view; a failed download can be retried. */
function loadIndex(): Promise<PreparedSiteSearch> {
  indexPromise ??= fetch(INDEX_URL, { credentials: 'omit' })
    .then((response) => {
      if (!response.ok) throw new Error('Search index unavailable');
      return response.json() as Promise<unknown>;
    })
    .then((data) => {
      const entries = parseSiteSearchIndex(data);
      if (entries.length === 0) throw new Error('Search index empty');
      return prepareSiteSearch(entries);
    })
    .catch((error: unknown) => {
      indexPromise = null;
      throw error;
    });
  return indexPromise;
}

/** Starts the index download early, for example when the search button is hovered. */
export function preloadSiteSearch() {
  void loadIndex().catch(() => undefined);
}

interface Item {
  entry: SiteSearchEntry;
  snippet: string;
  score: number;
}

const QUICK_LINKS: readonly SiteSearchEntry[] = [
  {
    id: 'quick:register',
    kind: 'page',
    title: 'Register a domain',
    context: 'Register',
    summary: 'Search a name and set up your domain, inbox and identity.',
    href: '/register',
  },
  {
    id: 'quick:pricing',
    kind: 'page',
    title: 'Pricing',
    context: 'Pricing',
    summary: 'Free inbox with every domain, plus Plus, Pro, Max and Enterprise plans.',
    href: '/pricing',
  },
  {
    id: 'quick:dashboard',
    kind: 'page',
    title: 'Dashboard',
    context: 'Account',
    summary: 'Manage your identities, email and renewals.',
    href: '/dashboard',
  },
  {
    id: 'quick:support',
    kind: 'page',
    title: 'Support',
    context: 'Support',
    summary: 'Contact the team, read common questions or report a security issue.',
    href: '/support',
  },
  {
    id: 'quick:docs',
    kind: 'page',
    title: 'Developer documentation',
    context: 'Docs',
    summary: 'Guides, API reference, SDK and MCP server.',
    href: DOCS_ORIGIN,
  },
];

const GROUP_LABEL: Record<SiteSearchKind, string> = {
  page: 'Pages',
  section: 'Sections',
  question: 'Questions',
};
const GROUP_ORDER: readonly SiteSearchKind[] = ['page', 'section', 'question'];

function isExternal(href: string) {
  return href.startsWith('https://');
}

function EntryIcon({ entry }: { entry: SiteSearchEntry }) {
  const Icon = isExternal(entry.href)
    ? BookOpen
    : entry.kind === 'question'
      ? MessageCircleQuestion
      : entry.kind === 'section'
        ? Hash
        : FileText;
  return <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark
            key={index}
            className="rounded-[3px] bg-[hsl(var(--brand-orange)/0.12)] px-px text-foreground shadow-[inset_0_-1.5px_0_hsl(var(--brand-orange)/0.6)]"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 border-border/90 bg-gradient-to-b from-card to-secondary/70 px-1.5 font-sans text-[11px] font-semibold leading-none text-foreground/70 shadow-[0_1px_2px_rgba(20,21,18,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]">
      {children}
    </kbd>
  );
}

/**
 * Site-wide search: a modal on the page's top layer with keyboard navigation, grouped results and
 * matched words highlighted. It searches the public website; the documentation has its own search.
 */
export function SiteSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [prepared, setPrepared] = useState<PreparedSiteSearch | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  /** -1 = nothing highlighted until the keyboard or the pointer picks a row; Enter opens the first. */
  const [active, setActive] = useState(-1);
  /** Only keyboard moves scroll the list; pointer hover never moves it under the cursor. */
  const keyboardNavRef = useRef(false);
  /** Set once the pointer really moves over a result, so only a real hover is undone on leave. */
  const pointerHoverRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  const load = () => {
    setStatus('loading');
    loadIndex().then(
      (index) => {
        setPrepared(index);
        setStatus('ready');
      },
      () => setStatus('error'),
    );
  };

  useEffect(() => {
    if (open && !prepared) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Load once when first opened.
  }, [open]);

  const trimmed = query.trim();
  const items: Item[] = useMemo(() => {
    if (!trimmed) return QUICK_LINKS.map((entry) => ({ entry, snippet: entry.summary, score: 0 }));
    if (!prepared) return [];
    return searchSite(prepared, trimmed);
  }, [trimmed, prepared]);

  const groups = useMemo(() => {
    if (!trimmed) return [{ label: 'Quick links', items }];
    // The group holding the best match comes first; ties keep pages, sections, questions order.
    return GROUP_ORDER.map((kind, order) => {
      const groupItems = items.filter((item) => item.entry.kind === kind);
      return {
        label: GROUP_LABEL[kind],
        items: groupItems,
        best: Math.max(0, ...groupItems.map((item) => item.score)),
        order,
      };
    })
      .filter((group) => group.items.length > 0)
      .sort((a, b) => b.best - a.best || a.order - b.order);
  }, [items, trimmed]);
  const ordered = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    setActive(-1);
    keyboardNavRef.current = false;
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [trimmed]);

  useEffect(() => {
    if (!keyboardNavRef.current) return;
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !option) return;
    // Keep the row clear of the sticky group label above it.
    const label = option.parentElement?.querySelector<HTMLElement>('[data-group-label]');
    const top = option.offsetTop - (label?.offsetHeight ?? 0) - 6;
    const bottom = option.offsetTop + option.offsetHeight + 10;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [active, ordered]);

  const close = () => {
    onClose();
  };

  /**
   * Leaving through a result: unlock page scrolling and close right away, before the browser follows
   * the link, so a same-page jump (for example to a question) can scroll into place.
   */
  const leave = () => {
    document.documentElement.style.overflow = '';
    dialogRef.current?.close();
    onClose();
  };

  const openActive = () => {
    const option = listRef.current?.querySelector<HTMLAnchorElement>(
      `[data-index="${Math.max(0, active)}"]`,
    );
    option?.click();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (ordered.length === 0) return;
    if (event.key === 'ArrowDown') {
      keyboardNavRef.current = true;
      setActive((index) => (index < 0 ? 0 : (index + 1) % ordered.length));
    } else if (event.key === 'ArrowUp') {
      keyboardNavRef.current = true;
      setActive((index) => (index <= 0 ? ordered.length - 1 : index - 1));
    } else if (event.key === 'Enter') openActive();
    else return;
    event.preventDefault();
  };

  const searching = Boolean(trimmed) && status === 'loading';
  const failed = Boolean(trimmed) && status === 'error';
  const empty = Boolean(trimmed) && status === 'ready' && ordered.length === 0;
  const announcement = !trimmed
    ? ''
    : searching
      ? 'Searching'
      : failed
        ? 'Search is unavailable right now.'
        : `${ordered.length} ${ordered.length === 1 ? 'result' : 'results'}`;

  let index = -1;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-site-search-dialog
      onClose={close}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="site-search-dialog fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-popover p-0 text-foreground backdrop:bg-[hsl(90_6%_10%/0.5)] backdrop:backdrop-blur-[6px] open:flex sm:inset-x-0 sm:bottom-auto sm:top-[11vh] sm:mx-auto sm:h-auto sm:max-h-[min(40rem,78vh)] sm:w-[calc(100%-2rem)] sm:max-w-[40rem] sm:rounded-2xl sm:border sm:border-border/70 sm:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(20,21,18,0.04),0_44px_110px_-42px_rgba(20,21,18,0.7),0_14px_34px_-20px_rgba(20,21,18,0.35)] [&:not([open])]:hidden"
    >
      <h2 id={titleId} className="sr-only">
        Search OpenSignet
      </h2>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4 sm:px-5">
        <Search className="h-5 w-5 shrink-0 text-foreground/55" strokeWidth={2} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={ordered.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            ordered.length > 0 && active >= 0 ? `${listId}-${active}` : undefined
          }
          aria-label="Search OpenSignet"
          placeholder="Search pages, plans and questions"
          value={query}
          maxLength={SITE_SEARCH_QUERY_MAX}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground caret-[hsl(var(--brand-orange))] outline-none placeholder:text-muted-foreground/80 sm:text-[16px] [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-md px-1.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:hidden"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Close search"
          className="hidden h-7 shrink-0 items-center rounded-lg border border-b-2 border-border/90 bg-gradient-to-b from-card to-secondary/70 px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground shadow-[0_1px_2px_rgba(20,21,18,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] transition-[color,background-color,transform] hover:text-foreground active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:inline-flex"
        >
          Esc
        </button>
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={trimmed ? 'Search results' : 'Quick links'}
        onMouseLeave={() => {
          if (!pointerHoverRef.current) return;
          pointerHoverRef.current = false;
          setActive(-1);
        }}
        className="site-search-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-3"
      >
        {searching ? (
          <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            Searching…
          </div>
        ) : failed ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Search is unavailable right now.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-4 inline-flex h-9 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              Try again
            </button>
          </div>
        ) : empty ? (
          <div className="px-4 py-10 text-center">
            <SearchX className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium text-foreground">
              No results for “<span className="wrap-anywhere">{trimmed}</span>”
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
              Check the spelling or try a broader word, such as a plan, a feature or a question.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <a
                href="/support"
                onClick={leave}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                Contact support
              </a>
              <a
                href={DOCS_ORIGIN}
                onClick={leave}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                Search the docs
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          </div>
        ) : (
          groups.map((group) => (
            <div
              key={group.label}
              role="group"
              aria-label={group.label}
              className="flex flex-col gap-1 pb-1.5"
            >
              <div
                aria-hidden
                data-group-label
                className="sticky top-0 z-[1] -mx-2.5 bg-popover px-5 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/90 shadow-[0_8px_8px_-8px_hsl(var(--popover))]"
              >
                {group.label}
              </div>
              {group.items.map(({ entry, snippet }) => {
                index += 1;
                const position = index;
                const selected = position === active;
                const external = isExternal(entry.href);
                return (
                  <a
                    key={entry.id}
                    id={`${listId}-${position}`}
                    data-index={position}
                    role="option"
                    aria-selected={selected}
                    href={entry.href}
                    tabIndex={-1}
                    onClick={leave}
                    onMouseMove={() => {
                      keyboardNavRef.current = false;
                      pointerHoverRef.current = true;
                      if (!selected) setActive(position);
                    }}
                    className={cn(
                      'relative flex items-center gap-3.5 rounded-xl px-3 py-3 outline-none transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none',
                      selected &&
                        'bg-card shadow-[0_1px_2px_rgba(20,21,18,0.06),0_10px_24px_-16px_rgba(20,21,18,0.4)] ring-1 ring-border/80',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none',
                        selected
                          ? 'bg-primary text-primary-foreground shadow-[0_6px_14px_-8px_rgba(20,21,18,0.6)]'
                          : 'bg-secondary/80 text-muted-foreground ring-1 ring-inset ring-border/70',
                      )}
                    >
                      <EntryIcon entry={entry} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium tracking-[-0.005em] text-foreground">
                        <Highlighted text={entry.title} query={trimmed} />
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-5 text-muted-foreground">
                        <span className="font-medium text-foreground/65">{entry.context}</span>
                        <span aria-hidden className="px-1 text-border">
                          /
                        </span>
                        <Highlighted text={snippet} query={trimmed} />
                      </span>
                    </span>
                    <span
                      className={cn(
                        'hidden shrink-0 items-center text-muted-foreground transition-opacity duration-150 sm:inline-flex',
                        selected ? 'opacity-100' : external ? 'opacity-60' : 'opacity-0',
                      )}
                      aria-hidden
                    >
                      {external ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/90 bg-secondary/70">
                          <CornerDownLeft className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </span>
                  </a>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="hidden shrink-0 items-center justify-between gap-4 border-t border-border/60 bg-secondary/45 px-5 py-3 text-xs text-muted-foreground sm:flex">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-1">
              <Kbd>
                <ArrowUp className="h-3 w-3" strokeWidth={2.5} aria-label="Up" />
              </Kbd>
              <Kbd>
                <ArrowDown className="h-3 w-3" strokeWidth={2.5} aria-label="Down" />
              </Kbd>
            </span>
            <span className="font-medium">Navigate</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft className="h-3 w-3" strokeWidth={2.5} aria-label="Enter" />
            </Kbd>
            <span className="font-medium">Open</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            <span className="font-medium">Close</span>
          </span>
        </div>
        <a
          href={DOCS_ORIGIN}
          onClick={leave}
          className="group/docs inline-flex h-7 items-center gap-1.5 rounded-lg px-2 font-medium transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          Developer docs
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform group-hover/docs:-translate-y-px group-hover/docs:translate-x-px"
            aria-hidden
          />
        </a>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </dialog>
  );
}
