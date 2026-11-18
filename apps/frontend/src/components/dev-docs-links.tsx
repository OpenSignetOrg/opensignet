'use client';

import { useEffect } from 'react';

const LIVE_DOCS_ORIGIN = 'https://docs.opensignet.com';
/** The local docs server's port (`server.port` in apps/docs/astro.config.ts). */
const LOCAL_DOCS_PORT = 4517;

/**
 * Development only: links to the live documentation open the local docs server instead, so the
 * whole site can be tried on localhost before the docs are deployed. Production builds never run
 * this (the check below is replaced at build time), and the source keeps the live URLs.
 */
export function DevDocsLinks() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const local = `${window.location.protocol}//${window.location.hostname}:${LOCAL_DOCS_PORT}`;
    const point = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a');
      const href = link?.getAttribute('href');
      if (!link || !href?.startsWith(LIVE_DOCS_ORIGIN)) return;
      link.setAttribute('href', `${local}${href.slice(LIVE_DOCS_ORIGIN.length)}`);
    };
    // Before the click, middle-click or keyboard activation happens, so every way of opening the
    // link uses the local address.
    document.addEventListener('pointerdown', point, true);
    document.addEventListener('focusin', point, true);
    document.addEventListener('mouseover', point, true);
    return () => {
      document.removeEventListener('pointerdown', point, true);
      document.removeEventListener('focusin', point, true);
      document.removeEventListener('mouseover', point, true);
    };
  }, []);
  return null;
}
