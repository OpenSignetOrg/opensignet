'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import Link from 'next/link';
import { GripVertical, Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConsole, type ConsoleIdentity } from './console-context';
import { IdentityTile, StatusDot } from './identity-bits';

const PAGE = 10;
/** A row and the gap under it, in pixels. */
const ROW = 38;

/**
 * The sidebar's identities: pinned ones first, then the rest in the owner's order. Rows are dragged
 * by their handle (mouse or touch) or moved with the arrow keys on the handle; the order and pins
 * are saved to the account. Ten show at first, with Show more.
 */
export function SidebarIdentities({
  items,
  activeId,
  onNavigate,
}: {
  items: ConsoleIdentity[];
  activeId: string | undefined;
  onNavigate?: () => void;
}) {
  const { arrange } = useConsole();
  const [limit, setLimit] = useState(PAGE);
  const pinned = items.filter((item) => item.pinned);
  const others = items.filter((item) => !item.pinned);

  // The first `limit`, pinned first; the open identity stays visible even beyond them.
  const shown = new Set([...pinned, ...others].slice(0, limit).map((item) => item.id));
  if (activeId) shown.add(activeId);

  function commit(group: 'pinned' | 'others', next: ConsoleIdentity[]) {
    const rest = (group === 'pinned' ? pinned : others).filter((item) => !shown.has(item.id));
    const reordered = [...next, ...rest];
    arrange(group === 'pinned' ? [...reordered, ...others] : [...pinned, ...reordered]);
  }

  function togglePin(identity: ConsoleIdentity) {
    const flipped = { ...identity, pinned: !identity.pinned };
    const without = items.filter((item) => item.id !== identity.id);
    const nextPinned = without.filter((item) => item.pinned);
    const nextOthers = without.filter((item) => !item.pinned);
    // A new pin goes last among the pinned; an unpinned identity leads the rest.
    arrange([...nextPinned, flipped, ...nextOthers]);
  }

  const hidden = items.length - shown.size;

  return (
    <div className="flex flex-col gap-0.5">
      {pinned.length > 0 ? (
        <>
          <div className="px-2.5 pb-0.5 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            Pinned
          </div>
          <SortableGroup
            label="Pinned identities"
            items={pinned.filter((item) => shown.has(item.id))}
            activeId={activeId}
            onNavigate={onNavigate}
            onReorder={(next) => commit('pinned', next)}
            onTogglePin={togglePin}
          />
          {others.some((item) => shown.has(item.id)) ? (
            <div className="mx-2.5 my-1 border-t border-border/60" aria-hidden />
          ) : null}
        </>
      ) : null}
      <SortableGroup
        label="Identities"
        items={others.filter((item) => shown.has(item.id))}
        activeId={activeId}
        onNavigate={onNavigate}
        onReorder={(next) => commit('others', next)}
        onTogglePin={togglePin}
      />
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setLimit((value) => value + PAGE)}
          className="flex h-8 items-center rounded-lg px-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Show {Math.min(PAGE, hidden)} more
          <span className="ml-1 tabular-nums text-muted-foreground/70">· {hidden} left</span>
        </button>
      ) : null}
    </div>
  );
}

function SortableGroup({
  label,
  items,
  activeId,
  onNavigate,
  onReorder,
  onTogglePin,
}: {
  label: string;
  items: ConsoleIdentity[];
  activeId: string | undefined;
  onNavigate?: () => void;
  onReorder: (next: ConsoleIdentity[]) => void;
  onTogglePin: (identity: ConsoleIdentity) => void;
}) {
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; dy: number } | null>(
    null,
  );
  const start = useRef(0);
  const [announce, setAnnounce] = useState('');

  const order = (() => {
    if (!drag) return items;
    const next = [...items];
    const [moved] = next.splice(drag.from, 1);
    if (moved) next.splice(drag.to, 0, moved);
    return next;
  })();

  function down(event: PointerEvent<HTMLButtonElement>, index: number, id: string) {
    if (event.button !== 0 || items.length < 2) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = event.clientY;
    setDrag({ id, from: index, to: index, dy: 0 });
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const dy = event.clientY - start.current;
    const to = Math.max(0, Math.min(items.length - 1, drag.from + Math.round(dy / ROW)));
    setDrag({ ...drag, dy, to });
  }

  function up() {
    if (!drag) return;
    const moved = drag.from !== drag.to;
    setDrag(null);
    if (moved) onReorder(order);
  }

  function key(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const to = index + step;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onReorder(next);
    setAnnounce(`${moved.domain} moved to position ${to + 1} of ${items.length}.`);
    // Keep the focus on the handle that moved.
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-reorder="${moved.id}"]`)?.focus();
    });
  }

  if (items.length === 0) return null;

  return (
    <>
      <ul aria-label={label} className="flex flex-col gap-0.5">
        {order.map((identity) => {
          const index = items.findIndex((item) => item.id === identity.id);
          const dragging = drag?.id === identity.id;
          const active = activeId === identity.id;
          return (
            <li
              key={identity.id}
              className={cn(
                'group/row relative rounded-lg',
                dragging &&
                  'z-10 bg-card shadow-[0_6px_18px_-6px_hsl(90_5%_12%/0.35),0_0_0_1px_hsl(90_5%_12%/0.08)]',
              )}
              style={
                dragging && drag
                  ? { transform: `translateY(${drag.dy - (drag.to - drag.from) * ROW}px)` }
                  : undefined
              }
            >
              <Link
                href={`/dashboard/identities/${encodeURIComponent(identity.id)}`}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                draggable={false}
                className={cn(
                  'flex h-9 min-w-0 items-center gap-2.5 rounded-lg pl-2 pr-[60px] text-[13.5px] font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  active
                    ? 'console-nav-active text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground',
                )}
              >
                <IdentityTile domain={identity.domain} size="sm" />
                <span className="min-w-0 flex-1 truncate">{identity.domain}</span>
              </Link>
              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                <span className="group-focus-within/row:hidden group-hover/row:hidden [@media(hover:none)]:hidden">
                  <StatusDot status={identity.status} />
                </span>
                <button
                  type="button"
                  aria-label={
                    identity.pinned ? `Unpin ${identity.domain}` : `Pin ${identity.domain}`
                  }
                  title={identity.pinned ? 'Unpin' : 'Pin to top'}
                  onClick={() => onTogglePin(identity)}
                  className="hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-focus-within/row:flex group-hover/row:flex [@media(hover:none)]:flex"
                >
                  {identity.pinned ? (
                    <PinOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Pin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  )}
                </button>
                {items.length > 1 ? (
                  <button
                    type="button"
                    data-reorder={identity.id}
                    aria-label={`Reorder ${identity.domain}. Use the up and down arrow keys.`}
                    title="Drag to reorder"
                    onPointerDown={(event) => down(event, index, identity.id)}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(event) => key(event, index)}
                    className={cn(
                      'hidden h-6 w-5 touch-none items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-focus-within/row:flex group-hover/row:flex [@media(hover:none)]:flex',
                      dragging ? 'flex cursor-grabbing' : 'cursor-grab',
                    )}
                  >
                    <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
