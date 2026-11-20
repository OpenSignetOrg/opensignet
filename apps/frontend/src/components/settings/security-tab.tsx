'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogOut, Monitor, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { AccountError } from '@/lib/account-client';
import type { AccountSession } from '@/lib/account-contract';
import { timeAgo } from '@/lib/utils';
import { useSettings } from './settings-context';
import { SettingsCard, SettingsRow, SettingsRows } from './settings-ui';
import { DeleteAccountCard } from './delete-account-card';

function messageOf(error: unknown) {
  return error instanceof AccountError ? error.message : new AccountError('unavailable').message;
}

export function SecurityTab() {
  return (
    <>
      <SessionsCard />
      <DeleteAccountCard />
    </>
  );
}

/* --------------------------------- Sessions -------------------------------- */

function SessionsCard() {
  const { client } = useSettings();
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      client
        .sessions(signal)
        .then((list) => {
          setSessions(list);
          setError(null);
        })
        .catch((failure: unknown) => {
          if (!signal?.aborted) setError(messageOf(failure));
        });
    },
    [client],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function revoke(id: string | 'others') {
    setBusy(id);
    try {
      if (id === 'others') await client.revokeOtherSessions();
      else await client.revokeSession(id);
      toast.success(id === 'others' ? 'Signed out of other devices' : 'Device signed out');
      load();
    } catch (failure) {
      toast.error('Couldn’t sign out that device', { description: messageOf(failure) });
    } finally {
      setBusy(null);
    }
  }

  async function signOutHere() {
    setBusy('current');
    try {
      await client.signOut();
      window.location.replace('/');
    } catch (failure) {
      toast.error('Couldn’t sign out', { description: messageOf(failure) });
      setBusy(null);
    }
  }

  const others = sessions?.filter((session) => !session.current) ?? [];

  return (
    <SettingsCard
      id="sessions"
      title="Devices"
      description="Where your account is signed in. Sign out anything you don’t recognize."
      footer={
        others.length > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">
              {others.length} other {others.length === 1 ? 'device' : 'devices'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-full sm:w-auto"
              disabled={busy !== null}
              onClick={() => void revoke('others')}
            >
              {busy === 'others' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Sign out other devices
            </Button>
          </>
        ) : undefined
      }
    >
      {error ? (
        <InlineNotice>{error}</InlineNotice>
      ) : !sessions ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading devices">
          {[0, 1].map((key) => (
            <div
              key={key}
              className="h-12 animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : (
        <SettingsRows>
          {sessions.map((session) => {
            const Icon = /android|iphone|ipad|mobile/i.test(session.device) ? Smartphone : Monitor;
            return (
              <SettingsRow
                key={session.id}
                icon={<Icon strokeWidth={1.75} />}
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    {session.device}
                    {session.current && (
                      <span className="rounded-full border border-[hsl(var(--brand-emerald)/0.35)] bg-[hsl(var(--brand-emerald)/0.08)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--brand-emerald))]">
                        This device
                      </span>
                    )}
                  </span>
                }
                detail={[
                  session.location,
                  session.current ? 'Active now' : `Last active ${timeAgo(session.lastSeenAt)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                actions={
                  session.current ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 text-muted-foreground"
                      disabled={busy !== null}
                      onClick={() => void signOutHere()}
                    >
                      {busy === 'current' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      )}
                      Sign out
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      disabled={busy !== null}
                      onClick={() => void revoke(session.id)}
                    >
                      {busy === session.id && (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      )}
                      Sign out
                    </Button>
                  )
                }
              />
            );
          })}
        </SettingsRows>
      )}
    </SettingsCard>
  );
}
