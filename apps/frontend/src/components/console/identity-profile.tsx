'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ImageUp, Loader2, RotateCw, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';
import { cn } from '@/lib/utils';
import { IdentityTile } from './identity-bits';

/**
 * The identity's profile: the name and logo people see in mail from it.
 *
 *   GET    /api/v1/agents/:id/profile                 -> IdentityProfile
 *   PUT    /api/v1/agents/:id/profile { displayName } -> IdentityProfile
 *   PUT    /api/v1/agents/:id/profile/logo  (image)   -> IdentityProfile
 *   DELETE /api/v1/agents/:id/profile/logo            -> IdentityProfile
 *
 * A new name or logo counts as one change; two are allowed each calendar month.
 */
const profileSchema = z
  .object({
    displayName: z.string().nullable(),
    logo: z
      .object({
        url: z.string().startsWith('/api/v1/logos/'),
        type: z.enum(['svg', 'png']),
        bimiReady: z.boolean(),
      })
      .strict()
      .nullable(),
    changesRemaining: z.number().int().nonnegative(),
    changesResetAt: z.string().datetime({ offset: true }),
  })
  .strict();
type IdentityProfile = z.infer<typeof profileSchema>;

const LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

async function send(url: string, init: RequestInit): Promise<IdentityProfile> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      ...init,
    });
  } catch {
    throw new Error('Check your connection and try again. Nothing has changed.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'The profile couldn’t be saved. Nothing has changed; try again in a moment.',
    );
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) throw new Error('The profile couldn’t be loaded. Try again in a moment.');
  return parsed.data;
}

function resetDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/** The Profile panel at the top of the Domain tab. */
export function IdentityProfilePanel({
  identityId,
  domain,
}: {
  identityId: string;
  domain: string;
}) {
  const base = `/api/v1/agents/${encodeURIComponent(identityId)}/profile`;
  const nameId = useId();
  const helpId = useId();
  const file = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'name' | 'logo' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    fetch(base, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(API_TIMEOUT_MS)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable');
        const parsed = profileSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setProfile(parsed);
        setName(parsed.displayName ?? '');
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [base, attempt]);

  async function run(
    kind: 'name' | 'logo' | 'remove',
    action: () => Promise<IdentityProfile>,
    done: string,
  ) {
    setBusy(kind);
    setError(null);
    try {
      const next = await action();
      setProfile(next);
      setName(next.displayName ?? '');
      toast.success(done);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'Nothing has changed. Try again.');
    } finally {
      setBusy(null);
    }
  }

  function saveName(event: FormEvent) {
    event.preventDefault();
    void run(
      'name',
      () =>
        send(base, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name.trim() || null }),
        }),
      name.trim() ? 'Name saved' : 'Name removed',
    );
  }

  function upload(chosen: File | undefined) {
    if (file.current) file.current.value = '';
    if (!chosen) return;
    if (!LOGO_TYPES.includes(chosen.type)) {
      setError('Use an SVG, PNG, JPG or WebP logo.');
      return;
    }
    if (chosen.size > LOGO_MAX_BYTES) {
      setError('Use a logo of up to 2 MB.');
      return;
    }
    void run(
      'logo',
      () =>
        send(`${base}/logo`, {
          method: 'PUT',
          headers: { 'Content-Type': chosen.type },
          body: chosen,
        }),
      'Logo saved',
    );
  }

  if (state === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <span>The profile couldn’t be loaded. Nothing has changed.</span>
        <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Try again
        </Button>
      </div>
    );
  }
  if (state === 'loading' || !profile) {
    return (
      <div className="flex items-center gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          Loading the profile
        </span>
        <span className="h-[72px] w-[72px] animate-pulse rounded-2xl bg-foreground/[0.06] motion-reduce:animate-none" />
        <span className="flex-1 space-y-2">
          <span className="block h-4 w-48 max-w-full animate-pulse rounded bg-foreground/[0.06] motion-reduce:animate-none" />
          <span className="block h-9 w-full max-w-sm animate-pulse rounded-lg bg-foreground/[0.05] motion-reduce:animate-none" />
        </span>
      </div>
    );
  }

  const out = profile.changesRemaining === 0;
  const changed = (profile.displayName ?? '') !== name.trim();
  const logoNote = !profile.logo
    ? 'A square SVG shows as your logo in inboxes that support BIMI. PNG, JPG and WebP show in OpenSignet.'
    : profile.logo.type === 'svg' && profile.logo.bimiReady
      ? 'Ready for inboxes that show sender logos (BIMI), such as Yahoo Mail. Gmail and Apple Mail also need a mark certificate.'
      : profile.logo.type === 'svg'
        ? 'This SVG is over 32 KB, so some inboxes may not show it. Simplify it to show it everywhere.'
        : 'Shown in OpenSignet. To show your logo in inboxes too, upload a square SVG.';

  return (
    <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-6">
      <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-3">
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-[repeating-conic-gradient(hsl(48_9%_92%)_0%_25%,hsl(0_0%_100%)_0%_50%)] bg-[length:12px_12px] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.6)]">
          {profile.logo ? (
            // A logo is the person's own upload, already sanitized and served from our origin.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.logo.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-card">
              <IdentityTile domain={domain} size="lg" />
            </span>
          )}
          {busy === 'logo' || busy === 'remove' ? (
            <span className="absolute inset-0 flex items-center justify-center bg-card/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={file}
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null || out}
            onClick={() => file.current?.click()}
          >
            <ImageUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {profile.logo ? 'Replace' : 'Upload logo'}
          </Button>
          {profile.logo ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove logo"
              disabled={busy !== null}
              onClick={() =>
                void run('remove', () => send(`${base}/logo`, { method: 'DELETE' }), 'Logo removed')
              }
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              <span className="md:sr-only">Remove</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <form onSubmit={saveName}>
          <label htmlFor={nameId} className="flex items-center gap-1.5 text-[13.5px] font-medium">
            <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            Sender name
          </label>
          <p id={helpId} className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">
            The name people see next to mail from {domain}.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id={nameId}
              aria-describedby={helpId}
              value={name}
              maxLength={64}
              placeholder={domain}
              autoComplete="organization"
              disabled={busy !== null}
              onChange={(event) => setName(event.target.value)}
              className="sm:max-w-sm"
            />
            <Button
              type="submit"
              size="sm"
              className="h-10 sm:w-auto"
              disabled={busy !== null || !changed || (out && name.trim() !== '')}
            >
              {busy === 'name' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </div>
        </form>

        <p className="mt-3 text-[12.5px] leading-5 text-muted-foreground">{logoNote}</p>
        <p
          className={cn(
            'mt-2 text-[12px] font-medium tabular-nums',
            out ? 'text-[hsl(22_80%_38%)]' : 'text-muted-foreground',
          )}
        >
          {out
            ? `No changes left this month. You can change the name or logo again on ${resetDay(profile.changesResetAt)}.`
            : `${profile.changesRemaining} of 2 changes left this month · resets ${resetDay(profile.changesResetAt)}`}
        </p>
        {error ? <InlineNotice className="mt-3">{error}</InlineNotice> : null}
      </div>
    </div>
  );
}
