'use client';

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Horizontal plan slider: three cards per view on large screens, two on tablets and one with a peek
 * of the next on phones. Native scroll snapping keeps touch swiping smooth; the arrow buttons and the
 * position dots move one card at a time and switch off at either end.
 */
export function PlanCarousel({ label, children }: { label: string; children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const slides = Children.toArray(children);
  const [visible, setVisible] = useState<{ first: number; last: number }>({ first: 0, last: 0 });
  /** Card an arrow click is moving to, so quick repeated clicks keep stepping while it scrolls. */
  const pendingRef = useRef<number | null>(null);
  const settleRef = useRef<number | undefined>(undefined);
  /**
   * On phones one card shows at a time, so the slider takes that card's height instead of the
   * tallest card's: no empty band under a short card.
   */
  const [phoneHeight, setPhoneHeight] = useState<number | undefined>(undefined);

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    let first = -1;
    let last = -1;
    Array.from(track.children).forEach((child, index) => {
      const rect = child.getBoundingClientRect();
      const shown = Math.min(rect.right, box.right) - Math.max(rect.left, box.left);
      if (shown >= rect.width * 0.6) {
        if (first < 0) first = index;
        last = index;
      }
    });
    setVisible({ first: Math.max(0, first), last: Math.max(0, last) });
    const shown = track.children[Math.max(0, first)];
    const phone = window.matchMedia('(max-width: 639px)').matches;
    // Track padding: 4px above and 12px below the cards.
    setPhoneHeight(phone && shown instanceof HTMLElement ? shown.offsetHeight + 16 : undefined);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(track);
    Array.from(track.children).forEach((child) => observer.observe(child));
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [measure]);

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    const target = track?.children[Math.max(0, Math.min(slides.length - 1, index))];
    if (!track || !(target instanceof HTMLElement)) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pendingRef.current = Math.max(0, Math.min(slides.length - 1, index));
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      pendingRef.current = null;
    }, 700);
    track.scrollTo({
      left: target.offsetLeft - track.offsetLeft - 4,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  const step = (direction: 1 | -1) => {
    const lastStart = Math.max(0, slides.length - (visible.last - visible.first + 1));
    const base = pendingRef.current ?? visible.first;
    scrollToIndex(Math.max(0, Math.min(lastStart, base + direction)));
  };

  useEffect(() => () => window.clearTimeout(settleRef.current), []);

  const atStart = visible.first === 0;
  const atEnd = visible.last >= slides.length - 1;

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} className="relative">
      <div
        ref={trackRef}
        style={phoneHeight ? { height: phoneHeight } : undefined}
        className="-mx-1 flex items-start snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 pb-3 pt-1 transition-[height] duration-300 ease-out [scrollbar-width:none] motion-reduce:transition-none sm:items-stretch sm:gap-6 [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, index) => (
          <div
            key={index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
            className="flex w-[86%] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
          >
            {slide}
          </div>
        ))}
      </div>

      <CarouselArrow direction="previous" disabled={atStart} onClick={() => step(-1)} />
      <CarouselArrow direction="next" disabled={atEnd} onClick={() => step(1)} />

      <div className="mt-4 flex items-center justify-center gap-2">
        {slides.map((_, index) => {
          const shown = index >= visible.first && index <= visible.last;
          return (
            <button
              key={index}
              type="button"
              aria-label={`Show plan ${index + 1} of ${slides.length}`}
              aria-current={index === visible.first ? 'true' : undefined}
              onClick={() => scrollToIndex(index)}
              className="group/dot inline-flex h-6 items-center justify-center px-0.5 focus-visible:outline-none"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-[width,background-color] duration-300 group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-ring/70 group-focus-visible/dot:ring-offset-2 group-focus-visible/dot:ring-offset-background motion-reduce:transition-none',
                  shown
                    ? 'w-6 bg-primary'
                    : 'w-1.5 bg-border group-hover/dot:bg-muted-foreground/60',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CarouselArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 'previous' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'previous' ? 'Previous plans' : 'Next plans'}
      className={cn(
        'absolute top-[calc(50%-1.25rem)] z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border/80 bg-card text-foreground shadow-[0_12px_28px_-14px_rgba(20,21,18,0.55)] transition-[opacity,transform,background-color,border-color] duration-200 hover:border-[hsl(var(--brand-orange)/0.5)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-95 disabled:pointer-events-none disabled:opacity-0 motion-reduce:transition-none sm:inline-flex',
        direction === 'previous' ? '-left-3 lg:-left-5' : '-right-3 lg:-right-5',
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
    </button>
  );
}
