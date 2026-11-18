'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { mountTurnstile } from '@/components/turnstile-lifecycle';
import { loadTurnstileScript } from '@/components/turnstile-widget';

/**
 * Cloudflare Turnstile in its "interaction-only" mode: invisible for almost everyone, and it only
 * shows a check when Cloudflare needs the person to act. Tokens are single use, so the parent
 * remounts it (new `key`) after each request that spends one.
 */
export function InvisibleTurnstile({
  siteKey,
  onToken,
  onError,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const callbacks = useRef({ onToken, onError });

  useLayoutEffect(() => {
    callbacks.current = { onToken, onError };
  }, [onToken, onError]);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    return mountTurnstile({
      container: element,
      siteKey,
      theme: 'light',
      appearance: 'interaction-only',
      loadProvider: async () => {
        await loadTurnstileScript();
        if (!window.turnstile) throw new Error('Turnstile failed to load');
        return window.turnstile;
      },
      onToken: (token) => callbacks.current.onToken(token),
      onError: (message) =>
        callbacks.current.onError(
          message
            ? 'We couldn’t run a quick security check. Refresh the page and try again.'
            : null,
        ),
    });
  }, [siteKey]);

  // Empty until Cloudflare asks for an interaction; then it shows its own compact check here.
  return <div ref={container} className="flex justify-center empty:hidden" />;
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const TOKEN_WAIT_MS = 12_000;

/** Waits for the invisible Turnstile token, so a fast click never fails for a check still running. */
export function useTurnstileToken() {
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const waiters = useRef<((value: string | null) => void)[]>([]);

  const onToken = useCallback((value: string | null) => {
    token.current = value;
    if (value) {
      for (const resolve of waiters.current.splice(0)) resolve(value);
    }
  }, []);

  const take = useCallback(async (): Promise<string | null> => {
    if (!TURNSTILE_SITE_KEY) return '';
    const value =
      token.current ??
      (await new Promise<string | null>((resolve) => {
        waiters.current.push(resolve);
        window.setTimeout(() => resolve(null), TOKEN_WAIT_MS);
      }));
    // Tokens are single use: remount the widget for the next request.
    token.current = null;
    setGeneration((current) => current + 1);
    return value;
  }, []);

  const widget = TURNSTILE_SITE_KEY ? (
    <InvisibleTurnstile
      key={generation}
      siteKey={TURNSTILE_SITE_KEY}
      onToken={onToken}
      onError={setError}
    />
  ) : null;

  return { take, widget, error };
}
