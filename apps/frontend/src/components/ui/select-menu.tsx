'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectMenuOption<T extends string | number> {
  value: T;
  label: string;
  /** Muted text at the end of the row, for example a dialling code. */
  hint?: string;
  /** Extra words the search matches, for example a country's code. */
  keywords?: string;
}

/** Tallest the menu grows before it scrolls inside (22rem). */
const MENU_MAX_HEIGHT = 352;
/** Approximate height of one option row plus the panel padding, used to size short lists. */
const OPTION_HEIGHT = 40;
const PANEL_PADDING = 10;
/** Keeps the menu clear of the sticky site header and the screen edges. */
const HEADER_CLEARANCE = 76;
const EDGE_CLEARANCE = 16;
const MIN_MENU_HEIGHT = 160;
/** Gap between the button and the menu. */
const MENU_OFFSET = 8;

/**
 * Focuses an option without scrolling the page (a page scroll would close the menu) and keeps it
 * visible inside the menu's own scroll area.
 */
function focusOption(option: HTMLButtonElement | null | undefined) {
  if (!option) return;
  option.focus({ preventScroll: true });
  const panel = option.parentElement;
  if (!panel) return;
  const top = option.offsetTop;
  const bottom = top + option.offsetHeight;
  if (top < panel.scrollTop) panel.scrollTop = top - 4;
  else if (bottom > panel.scrollTop + panel.clientHeight) {
    panel.scrollTop = bottom - panel.clientHeight + 4;
  }
}

/** Height of the optional heading row at the top of the menu. */
const HEADING_HEIGHT = 28;
/** Height of the search field at the top of a searchable menu. */
const SEARCH_HEIGHT = 48;

/** Options matching the search: labels that start with it first, then any other match. */
function matching<T extends string | number>(
  options: readonly SelectMenuOption<T>[],
  query: string,
): readonly SelectMenuOption<T>[] {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return options;
  const starts: SelectMenuOption<T>[] = [];
  const contains: SelectMenuOption<T>[] = [];
  for (const option of options) {
    const label = option.label.toLowerCase();
    if (label.startsWith(wanted)) starts.push(option);
    else if (
      `${label} ${option.keywords ?? ''} ${option.hint ?? ''}`.toLowerCase().includes(wanted)
    )
      contains.push(option);
  }
  return [...starts, ...contains];
}

/**
 * The platform's dropdown: the selected option is
 * highlighted with a check, it closes on outside click, Escape, page scroll or resize, and it is
 * fully keyboard operable (arrows, Home/End, Enter/Space). The menu opens upward when there is not
 * enough room below the button, and its height always fits on screen. It is rendered in a portal on
 * the page's top layer, so no neighbouring card or section can cover it.
 */
export function SelectMenu<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  ariaDescribedBy,
  id,
  className,
  menuMinWidth = 176,
  triggerClassName,
  anchorRef,
  heading,
  optionClassName,
  searchable = false,
  searchLabel = 'Search',
  valueLabel,
}: {
  value: T;
  options: readonly SelectMenuOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  id?: string;
  className?: string;
  /**
   * Smallest menu width in pixels from the sm breakpoint (default 11rem). The menu is never narrower
   * than the button and lines up with its right edge; on phones it matches the button.
   */
  menuMinWidth?: number;
  triggerClassName?: string;
  /**
   * Element the menu lines up with, when the button sits inside a larger field (for example the
   * domain-ending button inside the name field). On phones the menu then spans that whole field.
   */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Small label at the top of the menu, for example "Popular". */
  heading?: string;
  optionClassName?: string;
  /** Adds a search field at the top of the menu, for long lists such as countries. */
  searchable?: boolean;
  /** The search field's accessible name and placeholder, for example "Search countries". */
  searchLabel?: string;
  /** Shorter text for the button than the option's label, for example "+880". */
  valueLabel?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const visible = searchable ? matching(options, query) : options;
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus({ preventScroll: true });
    else focusOption(optionRefs.current[selectedIndex]);
    const inside = (target: EventTarget | null) =>
      Boolean(
        rootRef.current?.contains(target as Node | null) ||
        panelRef.current?.contains(target as Node | null),
      );
    const onPointerDown = (event: MouseEvent) => {
      if (!inside(event.target)) setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (inside(event.target)) return;
      setOpen(false);
    };
    // A phone keyboard opening (for the search field) changes only the height: keep the menu.
    const openWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== openWidth) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [open, selectedIndex, searchable]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const openMenu = () => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const rect = anchorRef?.current?.getBoundingClientRect() ?? trigger;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const wanted = Math.min(
      MENU_MAX_HEIGHT,
      options.length * OPTION_HEIGHT +
        PANEL_PADDING +
        (heading ? HEADING_HEIGHT : 0) +
        (searchable ? SEARCH_HEIGHT : 0),
    );
    const below = viewportHeight - rect.bottom - MENU_OFFSET - EDGE_CLEARANCE;
    const above = rect.top - MENU_OFFSET - HEADER_CLEARANCE;
    const openAbove = below < wanted && above > below;
    const wide = window.matchMedia('(min-width: 640px)').matches;
    // Phones: as wide as the button, or the whole field when anchored. Wider screens: the button's
    // width, at least the menu minimum, aligned to the field's right edge.
    const base = wide ? Math.max(trigger.width, menuMinWidth) : rect.width;
    const width = Math.min(base, viewportWidth - EDGE_CLEARANCE);
    const left = Math.max(EDGE_CLEARANCE / 2, rect.right - width);
    setMenuStyle({
      left,
      width,
      maxHeight: Math.max(MIN_MENU_HEIGHT, Math.min(wanted, openAbove ? above : below)),
      ...(openAbove
        ? { bottom: viewportHeight - rect.top + MENU_OFFSET }
        : { top: rect.bottom + MENU_OFFSET }),
    });
    setOpen(true);
  };

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const count = visible.length;
    const inSearch = event.target === searchRef.current;
    const current = optionRefs.current.findIndex((element) => element === document.activeElement);
    const focusAt = (index: number) =>
      count ? focusOption(optionRefs.current[(index + count) % count]) : undefined;
    if (inSearch && event.key === 'Enter') {
      if (visible[0]) choose(visible[0].value);
    } else if (event.key === 'ArrowDown') focusAt(inSearch ? 0 : current + 1);
    else if (event.key === 'ArrowUp') {
      if (searchable && current === 0) searchRef.current?.focus({ preventScroll: true });
      else focusAt(current - 1);
    } else if (!inSearch && event.key === 'Home') focusAt(0);
    else if (!inSearch && event.key === 'End') focusAt(count - 1);
    else if (event.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') setOpen(false);
    else return;
    event.preventDefault();
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) openMenu();
          }
        }}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-background/70 px-3 text-sm font-medium text-foreground outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-60 sm:h-9 sm:w-auto sm:min-w-[7.5rem]',
          triggerClassName,
        )}
      >
        <span className="min-w-0 truncate">{valueLabel ?? selected?.label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              onKeyDown={onListKeyDown}
              className="fixed z-30 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-[0_22px_48px_-24px_rgba(20,21,18,0.5)]"
              style={menuStyle}
            >
              {searchable ? (
                <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 border-b border-border/70 bg-popover p-1.5">
                  <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-background/70 px-2.5 focus-within:ring-2 focus-within:ring-ring/70">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <input
                      ref={searchRef}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={searchLabel}
                      aria-label={searchLabel}
                      aria-controls={listId}
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
                    />
                  </label>
                </div>
              ) : null}
              {heading ? (
                <div
                  role="presentation"
                  className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {heading}
                </div>
              ) : null}
              {searchable && visible.length === 0 ? (
                <p role="status" className="px-3 py-3 text-sm text-muted-foreground">
                  No match. Try another spelling.
                </p>
              ) : null}
              {visible.map((option, index) => {
                const active = option.value === value;
                return (
                  <button
                    key={String(option.value)}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(option.value)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-primary/15 hover:text-foreground focus-visible:bg-primary/15 focus-visible:text-foreground',
                      optionClassName,
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {option.hint ? (
                        <span
                          className={cn(
                            'font-mono text-xs',
                            active ? 'text-primary-foreground/75' : 'text-muted-foreground',
                          )}
                        >
                          {option.hint}
                        </span>
                      ) : null}
                      {active ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
