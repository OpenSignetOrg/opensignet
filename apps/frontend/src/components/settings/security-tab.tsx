'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAccount, useChainId, useDisconnect, useSignMessage } from 'wagmi';
import { Loader2, LogOut, Mail, Monitor, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { CodeInput } from '@/components/sign-in/code-input';
import { useTurnstileToken } from '@/components/sign-in/invisible-turnstile';
import { GoogleLogo } from '@/components/sign-in/provider-logos';
import { WalletList } from '@/components/wallet/wallet-list';
import { AccountError } from '@/lib/account-client';
import type { AccountSession } from '@/lib/account-contract';
import { normalizeEmail } from '@/lib/sign-in-client';
import { EMAIL_CODE_LENGTH } from '@/lib/sign-in-contract';
import { WALLET_STATEMENTS, buildWalletMessage } from '@/lib/wallet-message';
import { shortAddress, timeAgo } from '@/lib/utils';
import { useSettings } from './settings-context';
import { SettingsCard, SettingsRow, SettingsRows } from './settings-ui';
import { StepUpCancelled, useStepUp } from './step-up';

function messageOf(error: unknown) {
  return error instanceof AccountError ? error.message : new AccountError('unavailable').message;
}

export function SecurityTab({ google }: { google: string | null }) {
  return (
    <>
      <EmailCard />
      <SignInMethodsCard google={google} />
      <SessionsCard />
    </>
  );
}

/* ---------------------------------- Email --------------------------------- */

function EmailCard() {
  const { client, account, update } = useSettings();
  const { run } = useStepUp();
  const [dialog, setDialog] = useState<'add' | 'change' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An email/Google account signs in with this email, so it can be changed but never removed.
  const removable = account.createdWith === 'wallet';

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      update(await run(() => client.removeEmail()));
      setDialog(null);
      toast.success('Email removed');
    } catch (failure) {
      if (!(failure instanceof StepUpCancelled)) setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      id="email"
      title="Email"
      description="Used to sign in with a one-time code and for security notices. One email per account, always verified."
    >
      <SettingsRows>
        <SettingsRow
          icon={<Mail strokeWidth={1.75} />}
          label={account.email ?? 'No email yet'}
          detail={
            account.email
              ? 'Verified'
              : 'Add an email to sign in with a code, or with Google using the same address.'
          }
          actions={
            account.email ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setDialog('change')}
                >
                  Change
                </Button>
                {removable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 text-muted-foreground"
                    onClick={() => {
                      setError(null);
                      setDialog('remove');
                    }}
                  >
                    Remove
                  </Button>
                )}
              </>
            ) : (
              <Button type="button" size="sm" className="h-9" onClick={() => setDialog('add')}>
                Add email
              </Button>
            )
          }
        />
      </SettingsRows>

      {(dialog === 'add' || dialog === 'change') && (
        <EmailDialog mode={dialog} onClose={() => setDialog(null)} />
      )}
      {dialog === 'remove' && (
        <Dialog
          title="Remove your email?"
          description="You’ll no longer be able to sign in with an email code or with Google using this address. You can add an email again anytime."
          onClose={() => setDialog(null)}
          busy={busy}
        >
          {error && <InlineNotice className="mb-4">{error}</InlineNotice>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void remove()}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Remove email
            </Button>
          </div>
        </Dialog>
      )}
    </SettingsCard>
  );
}

function EmailDialog({ mode, onClose }: { mode: 'add' | 'change'; onClose: () => void }) {
  const { client, account, update } = useSettings();
  const { run } = useStepUp();
  const emailId = useId();
  const codeId = useId();
  const codeInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountError | null>(null);
  const turnstile = useTurnstileToken();

  async function start(event?: FormEvent) {
    event?.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError(new AccountError('invalid_email'));
      return;
    }
    if (normalized === account.email) {
      setError(new AccountError('email_same'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const used = await turnstile.take();
      if (used === null) throw new AccountError('bot_check_failed');
      await run(() => client.startEmail(normalized, used));
      setSentTo(normalized);
      setStep('code');
      window.setTimeout(() => codeInput.current?.focus(), 0);
    } catch (failure) {
      if (!(failure instanceof StepUpCancelled))
        setError(failure instanceof AccountError ? failure : new AccountError('unavailable'));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (value.length !== EMAIL_CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      update(await client.verifyEmail(value));
      toast.success(mode === 'add' ? 'Email added' : 'Email changed');
      onClose();
    } catch (failure) {
      setError(failure instanceof AccountError ? failure : new AccountError('unavailable'));
      setCode('');
      window.setTimeout(() => codeInput.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  const dead = error?.code === 'code_expired' || error?.code === 'too_many_attempts';

  return (
    <Dialog
      title={mode === 'add' ? 'Add an email' : 'Change your email'}
      description={
        step === 'email' ? (
          'We’ll send a code to confirm the address is yours.'
        ) : (
          <>
            Enter the {EMAIL_CODE_LENGTH}-digit code we sent to{' '}
            <span className="font-medium text-foreground [overflow-wrap:anywhere]">{sentTo}</span>.
          </>
        )
      }
      onClose={onClose}
      busy={busy}
    >
      {step === 'email' ? (
        <form onSubmit={(event) => void start(event)} noValidate>
          <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium">
            {mode === 'add' ? 'Email' : 'New email'}
          </label>
          <Input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            className="h-11"
            disabled={busy}
            autoFocus
          />
          {turnstile.widget && <div className="mt-3">{turnstile.widget}</div>}
          {(error || turnstile.error) && (
            <InlineNotice className="mt-3">{error?.message ?? turnstile.error}</InlineNotice>
          )}
          {mode === 'change' && (
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              After the change, we’ll let {account.email} know, and you’ll sign in with the new
              address.
            </p>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !normalizeEmail(email)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Send code
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <label htmlFor={codeId} className="sr-only">
            {EMAIL_CODE_LENGTH}-digit code
          </label>
          <CodeInput
            ref={codeInput}
            id={codeId}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (error && !dead) setError(null);
            }}
            onComplete={(value) => void verify(value)}
            disabled={busy || dead}
            invalid={Boolean(error) && !dead}
          />
          {error && <InlineNotice className="mt-3">{error.message}</InlineNotice>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={busy || dead || code.length !== EMAIL_CODE_LENGTH}
              onClick={() => void verify(code)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Confirm
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ----------------------------- Sign-in methods ---------------------------- */

function SignInMethodsCard({ google }: { google: string | null }) {
  const { client, account, update } = useSettings();
  const { run } = useStepUp();
  const [dialog, setDialog] = useState<'unlink-google' | 'link-wallet' | 'unlink-wallet' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (google === 'linked') toast.success('Google is now linked to your account');
    else if (google === 'link_taken')
      toast.error('That Google account belongs to another OpenSignet account');
    else if (google === 'link_mismatch')
      toast.error('Use the Google account with the same email as your OpenSignet account');
    else if (google === 'cancelled') toast.info('Google linking was cancelled');
    else if (google === 'failed') toast.error('Google linking didn’t complete. Try again.');
  }, [google]);

  async function unlink(kind: 'google' | 'wallet') {
    setBusy(true);
    setError(null);
    try {
      update(await run(() => (kind === 'google' ? client.unlinkGoogle() : client.unlinkWallet())));
      setDialog(null);
      toast.success(kind === 'google' ? 'Google unlinked' : 'Wallet unlinked');
    } catch (failure) {
      if (!(failure instanceof StepUpCancelled)) setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }

  const googleHref = `/api/v1/auth/google/start?intent=link&return_to=${encodeURIComponent('/settings/security')}`;

  return (
    <SettingsCard
      id="sign-in-methods"
      title="Sign-in methods"
      description="Every method opens this same account. Keep at least one."
    >
      <SettingsRows>
        <SettingsRow
          icon={<GoogleLogo className="h-5 w-5" />}
          label="Google"
          detail={
            account.google
              ? account.google.email
              : account.email
                ? `Sign in with the Google account for ${account.email}.`
                : 'Linking Google also adds its email to your account.'
          }
          actions={
            account.google ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-muted-foreground"
                onClick={() => {
                  setError(null);
                  setDialog('unlink-google');
                }}
              >
                Unlink
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm" className="h-9">
                <a href={googleHref}>Link Google</a>
              </Button>
            )
          }
        />
        <SettingsRow
          icon={<span className="font-mono text-xs font-semibold">0x</span>}
          label="Wallet"
          detail={
            account.externalWallet ? (
              <span className="font-mono">{shortAddress(account.externalWallet.address, 6)}</span>
            ) : (
              'Link one outside wallet, such as MetaMask or Coinbase Wallet, to sign in with it.'
            )
          }
          actions={
            account.externalWallet ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-muted-foreground"
                onClick={() => {
                  setError(null);
                  setDialog('unlink-wallet');
                }}
              >
                Unlink
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setDialog('link-wallet')}
              >
                Link wallet
              </Button>
            )
          }
        />
      </SettingsRows>

      {(dialog === 'unlink-google' || dialog === 'unlink-wallet') && (
        <Dialog
          title={dialog === 'unlink-google' ? 'Unlink Google?' : 'Unlink this wallet?'}
          description={
            dialog === 'unlink-google'
              ? 'You won’t be able to sign in with Google until you link it again.'
              : 'You won’t be able to sign in with this wallet until you link it again. Your OpenSignet wallet is not affected.'
          }
          onClose={() => setDialog(null)}
          busy={busy}
        >
          {error && <InlineNotice className="mb-4">{error}</InlineNotice>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void unlink(dialog === 'unlink-google' ? 'google' : 'wallet')}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Unlink
            </Button>
          </div>
        </Dialog>
      )}
      {dialog === 'link-wallet' && <LinkWalletDialog onClose={() => setDialog(null)} />}
    </SettingsCard>
  );
}

function LinkWalletDialog({ onClose }: { onClose: () => void }) {
  const { client, account, update } = useSettings();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const embedded = account.embeddedWallet?.address.toLowerCase();
  const isEmbedded = Boolean(address && embedded && address.toLowerCase() === embedded);

  async function link() {
    if (!address || isEmbedded) return;
    setBusy(true);
    setError(null);
    try {
      const nonce = await client.walletNonce();
      const message = buildWalletMessage({
        address,
        chainId,
        nonce,
        statement: WALLET_STATEMENTS.link,
      });
      const signature = await signMessageAsync({ account: address, message });
      update(await client.linkWallet(message, signature));
      toast.success('Wallet linked');
      onClose();
    } catch (failure) {
      setError(
        failure instanceof AccountError
          ? failure.message
          : 'The signature wasn’t completed. Try again from your wallet.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Link a wallet"
      description="Sign one message to prove the wallet is yours. No gas, no payment."
      onClose={onClose}
      busy={busy}
    >
      {!isConnected || !address ? (
        <WalletList />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/50 px-3.5 py-3">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--brand-emerald))]" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              {shortAddress(address)}
            </span>
            <button
              type="button"
              className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => void disconnectAsync().catch(() => undefined)}
              disabled={busy}
            >
              Use another wallet
            </button>
          </div>
          {isEmbedded && (
            <InlineNotice tone="info">
              This is your OpenSignet wallet. It already signs in to this account.
            </InlineNotice>
          )}
          {error && <InlineNotice>{error}</InlineNotice>}
          <Button
            type="button"
            className="h-11 w-full"
            disabled={busy || isEmbedded}
            onClick={() => void link()}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? 'Confirm in your wallet' : 'Sign to link'}
          </Button>
        </div>
      )}
    </Dialog>
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
