'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether a horizontally scrollable element has more content to its left or right, updated as
 * it scrolls or resizes. Drives the edge shadows that tell people a row scrolls sideways.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): {
  left: boolean;
  right: boolean;
} {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const left = node.scrollLeft > 1;
      const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
      setEdges((current) =>
        current.left === left && current.right === right ? current : { left, right },
      );
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ref]);
  return edges;
}
