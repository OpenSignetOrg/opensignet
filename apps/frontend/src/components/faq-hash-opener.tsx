'use client';

import { useEffect } from 'react';

/**
 * Opens the FAQ answer named in the address hash (for example a search result link) and scrolls it
 * into view. Native `<details>` rows stay fully usable without JavaScript; this only adds the jump.
 */
export function FaqHashOpener({ sectionId }: { sectionId: string }) {
  useEffect(() => {
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith(`${sectionId}-`)) return;
      const target = document.getElementById(id);
      if (!(target instanceof HTMLDetailsElement)) return;
      target.open = true;
      target.querySelector('summary')?.focus({ preventScroll: true });
      // Scroll after the current frame so a closing overlay or late layout cannot cancel it.
      requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [sectionId]);
  return null;
}
