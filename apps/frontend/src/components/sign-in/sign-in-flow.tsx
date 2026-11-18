'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { base } from 'wagmi/chains';
import { ArrowLeft, Loader2, Mail, UserRound, Wallet } from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { COINBASE_RDNS, WalletList, useAnnouncedWallets } from '@/components/wallet/wallet-list';
import { useSiwe } from '@/hooks/use-siwe';
import { SESSION_CHANGED_EVENT } from '@/hooks/use-account-session';
import {
  SignInError,
  createSignInClient,
  googleStartUrl,
  normalizeDisplayName,
  normalizeEmail,
  safeReturnPath,
  type SignInClient,
} from '@/lib/sign-in-client';
import {
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_CODE_LENGTH,
  type Account,
  googleCallbackResults,
  type GoogleCallbackResult,
} from '@/lib/sign-in-contract';
import { cn, shortAddress } from '@/lib/utils';
import { CodeInput } from './code-input';
import { useTurnstileToken } from './invisible-turnstile';
import { CoinbaseWalletLogo, GoogleLogo, WalletConnectLogo } from './provider-logos';

type Step =
  | { kind: 'choose' }
  | { kind: 'wallet' }
  | { kind: 'code'; email: string | null; resendAt: number }
  | { kind: 'name' }
  | { kind: 'finishing' };

/**
 * One page for every way in: Google, a one-time email code, or a wallet. There is no separate
 * sign-up: a first sign-in creates the account, then asks for an optional name.
 */
export function SignInFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnPath(params.get('return_to'));
  const googleParam = params.get('google');
  const google = (googleCallbackResults as readonly string[]).includes(googleParam ?? '')
    ? (googleParam as GoogleCallbackResult)
    : null;
  const client = useMemo(() => createSignInClient(), []);
  const [step, setStep] = useState<Step>(() =>
    google === 'confirm_email'
      ? { kind: 'code', email: null, resendAt: Date.now() + 30_000 }
      : { kind: 'choose' },
  );
  const [email, setEmail] = useState('');

  const finish = useCallback(
    (account: Account | null) => {
      if (account?.onboarding === 'name') {
        setStep({ kind: 'name' });
        return;
      }
      setStep({ kind: 'finishing' });
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
      router.replace(returnTo);
    },
    [returnTo, router],
  );

  // Someone who is already signed in goes straight on. A failed check is silent: they can sign in.
  useEffect(() => {
    const controller = new AbortController();
    client
      .session(controller.signal)
      .then((session) => {
        if (session.authenticated && session.account.onboarding === null) finish(session.account);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [client, finish]);

  return (
    <div className="w-full max-w-[420px]">
      <div className="rounded-2xl border border-border/80 bg-card/95 px-5 py-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_30px_70px_-45px_rgba(20,21,18,0.55)] sm:px-8 sm:py-9">
        {step.kind === 'choose' && (
          <ChooseStep
            client={client}
            email={email}
            onEmailChange={setEmail}
            google={google}
            googleHref={googleStartUrl(returnTo)}
            onCodeSent={(sentTo, resendAt) => setStep({ kind: 'code', email: sentTo, resendAt })}
            onWallet={() => setStep({ kind: 'wallet' })}
          />
        )}
        {step.kind === 'wallet' && (
          <WalletStep
            client={client}
            onBack={() => setStep({ kind: 'choose' })}
            onSignedIn={finish}
          />
        )}
        {step.kind === 'code' && (
          <CodeStep
            client={client}
            email={step.email}
            resendAt={step.resendAt}
            onBack={() => setStep({ kind: 'choose' })}
            onResent={(resendAt) => setStep({ ...step, resendAt })}
            onSignedIn={(account) => finish(account)}
          />
        )}
        {step.kind === 'name' && <NameStep client={client} onDone={() => finish(null)} />}
        {step.kind === 'finishing' && (
          <div className="flex flex-col items-center py-10 text-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
            <p className="mt-4 text-sm text-muted-foreground">Signing you in…</p>
          </div>
        )}
      </div>

      {(step.kind === 'choose' || step.kind === 'wallet') && (
        <p className="mx-auto mt-5 max-w-[360px] text-balance text-center text-xs leading-5 text-muted-foreground">
          By continuing, you agree to the{' '}
          <Link
            href="/terms"
            className="font-medium text-foreground/80 underline-offset-4 hover:underline"
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="font-medium text-foreground/80 underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function StepHeader({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="text-center">
      <span
        className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-border/80 bg-background/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
        aria-hidden
      >
        {icon ?? <BrandMark className="h-[22px] sm:h-[22px]" />}
      </span>
      <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-[22px]">{title}</h1>
      {children && (
        <p className="mx-auto mt-2 max-w-[320px] text-sm leading-6 text-muted-foreground">
          {children}
        </p>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 mb-4 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </button>
  );
}

function ChooseStep({
  client,
  email,
  onEmailChange,
  google,
  googleHref,
  onCodeSent,
  onWallet,
}: {
  client: SignInClient;
  email: string;
  onEmailChange: (value: string) => void;
  google: GoogleCallbackResult | null;
  googleHref: string;
  onCodeSent: (email: string, resendAt: number) => void;
  onWallet: () => void;
}) {
  const emailId = useId();
  const errorId = useId();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const turnstile = useTurnstileToken();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError(new SignInError('invalid_email').message);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const token = await turnstile.take();
      if (token === null) throw new SignInError('bot_check_failed');
      const challenge = await client.startEmail(normalized, token);
      onCodeSent(normalized, Date.parse(challenge.resendAvailableAt));
    } catch (failure) {
      setError(
        failure instanceof SignInError ? failure.message : new SignInError('unavailable').message,
      );
      setSending(false);
    }
  }

  return (
    <>
      <StepHeader title="Sign in to OpenSignet">
        New here? Signing in creates your account.
      </StepHeader>

      {google === 'cancelled' && (
        <InlineNotice tone="info" className="mt-6">
          Google sign-in was cancelled. Choose a way to continue.
        </InlineNotice>
      )}
      {google === 'failed' && (
        <InlineNotice className="mt-6">
          We couldn’t complete Google sign-in. Try again, or use another option.
        </InlineNotice>
      )}

      <div className="mt-7">
        <a
          href={googleHref}
          onClick={() => setLeaving(true)}
          aria-busy={leaving || undefined}
          className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-[#dadce0] bg-white px-4 text-[15px] font-medium text-[#1f1f1f] shadow-[0_1px_2px_rgba(20,21,18,0.06)] transition-[background-color,box-shadow] hover:bg-[#f8f9fa] hover:shadow-[0_2px_6px_-2px_rgba(20,21,18,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
        >
          {leaving ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin text-[#5f6368]" aria-hidden />
          ) : (
            <GoogleLogo />
          )}
          Continue with Google
        </a>
      </div>

      <Divider />

      <form onSubmit={submit} noValidate>
        <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium">
          Email
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
            onEmailChange(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-11 text-[15px]"
          disabled={sending}
        />
        {(error ?? turnstile.error) && (
          <div id={errorId} className="mt-2">
            <InlineNotice>{error ?? turnstile.error}</InlineNotice>
          </div>
        )}
        {turnstile.widget && <div className="mt-3">{turnstile.widget}</div>}
        <Button
          type="submit"
          className="mt-3 h-11 w-full text-[15px]"
          disabled={sending || !normalizeEmail(email)}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          )}
          {sending ? 'Sending code…' : 'Continue with email'}
        </Button>
      </form>

      <Divider />

      <button
        type="button"
        onClick={onWallet}
        className="group flex h-11 w-full items-center gap-3 rounded-lg border border-input bg-card/70 px-3.5 text-[15px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition-colors hover:border-foreground/25 hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
      >
        <Wallet className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">Continue with a wallet</span>
        <WalletPreviewIcons />
      </button>
    </>
  );
}

/**
 * Small marks that hint at what "Continue with a wallet" offers: the most popular wallet found in
 * this browser (if any), Coinbase Wallet (when it is offered) and WalletConnect, always last.
 */
function WalletPreviewIcons() {
  const announced = useAnnouncedWallets();
  const { connectors } = useConnect();
  const popular = announced.find(
    (wallet) => wallet.info.rdns.toLowerCase() !== COINBASE_RDNS && wallet.info.icon,
  );
  const coinbase =
    connectors.some((connector) => connector.id === 'coinbaseWalletSDK') ||
    announced.some((wallet) => wallet.info.rdns.toLowerCase() === COINBASE_RDNS);
  const frame =
    'block h-5 w-5 shrink-0 overflow-hidden rounded-[5px] [&>img]:h-full [&>img]:w-full [&>svg]:h-full [&>svg]:w-full';
  return (
    <span className="hidden shrink-0 items-center gap-1 min-[360px]:flex" aria-hidden>
      {popular?.info.icon && (
        <span className={frame}>
          {/* Wallet-announced data image, rendered only as <img>. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={popular.info.icon}
            alt=""
            decoding="async"
            referrerPolicy="no-referrer"
            className="object-contain"
          />
        </span>
      )}
      {coinbase && (
        <span className={frame}>
          <CoinbaseWalletLogo />
        </span>
      )}
      <span className={frame}>
        <WalletConnectLogo />
      </span>
    </span>
  );
}

function WalletStep({
  client,
  onBack,
  onSignedIn,
}: {
  client: SignInClient;
  onBack: () => void;
  onSignedIn: (account: Account | null) => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { signIn, loading, error } = useSiwe();
  const [failed, setFailed] = useState<string | null>(null);
  const attempted = useRef<string | null>(null);
  // A wallet that was already connected when this step opened waits for an explicit click; one
  // connected here signs in right away.
  const connectedOnOpen = useRef(isConnected);

  const run = useCallback(async () => {
    setFailed(null);
    const ok = await signIn();
    if (!ok) return;
    try {
      const session = await client.session();
      onSignedIn(session.authenticated ? session.account : null);
    } catch {
      setFailed(new SignInError('unavailable').message);
    }
  }, [client, signIn, onSignedIn]);

  // As soon as a wallet connects here and is on Base, ask it for the one sign-in signature.
  // (Waiting for Base avoids starting the request while the wallet is still switching networks.)
  useEffect(() => {
    if (!isConnected) connectedOnOpen.current = false;
    if (connectedOnOpen.current || !isConnected || !address || chainId !== base.id) return;
    if (attempted.current === address) return;
    attempted.current = address;
    void run();
  }, [isConnected, address, chainId, run]);

  const message = failed ?? error;

  return (
    <>
      <BackButton onClick={onBack}>All sign-in options</BackButton>
      <StepHeader icon={<Wallet className="h-5 w-5" strokeWidth={1.75} />} title="Connect a wallet">
        You’ll sign one message to prove the wallet is yours. No gas, no payment.
      </StepHeader>

      <div className="mt-6">
        {isConnected && address ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/50 px-3.5 py-3">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--brand-emerald))]"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {shortAddress(address)}
              </span>
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={async () => {
                  attempted.current = null;
                  setFailed(null);
                  await disconnectAsync().catch(() => undefined);
                }}
              >
                Use another wallet
              </button>
            </div>
            {loading ? (
              <div
                className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground"
                role="status"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Confirm the request in your wallet
              </div>
            ) : (
              <>
                {message && <InlineNotice>{message}</InlineNotice>}
                <Button
                  type="button"
                  className="h-11 w-full text-[15px]"
                  onClick={() => void run()}
                >
                  Sign in with this wallet
                </Button>
              </>
            )}
          </div>
        ) : (
          <WalletList />
        )}
      </div>
    </>
  );
}

function CodeStep({
  client,
  email,
  resendAt,
  onBack,
  onResent,
  onSignedIn,
}: {
  client: SignInClient;
  /** null after Google asked us to confirm the Google account's email. */
  email: string | null;
  resendAt: number;
  onBack: () => void;
  onResent: (resendAt: number) => void;
  onSignedIn: (account: Account) => void;
}) {
  const inputId = useId();
  const messageId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const turnstile = useTurnstileToken();

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    if (now >= resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [now, resendAt]);

  const dead = error?.code === 'code_expired' || error?.code === 'too_many_attempts';
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function verify(value: string) {
    if (verifying || value.length !== EMAIL_CODE_LENGTH) return;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const result = await client.verifyEmail(value);
      onSignedIn(result.account);
    } catch (failure) {
      const signInError = failure instanceof SignInError ? failure : new SignInError('unavailable');
      setError(signInError);
      setCode('');
      setVerifying(false);
      window.setTimeout(() => input.current?.focus(), 0);
    }
  }

  async function resend() {
    if (!email || resending || wait > 0) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const token = await turnstile.take();
      if (token === null) throw new SignInError('bot_check_failed');
      const challenge = await client.startEmail(email, token);
      setCode('');
      setNotice('We sent a new code. Earlier codes no longer work.');
      setNow(Date.now());
      onResent(Date.parse(challenge.resendAvailableAt));
      input.current?.focus();
    } catch (failure) {
      setError(failure instanceof SignInError ? failure : new SignInError('unavailable'));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <BackButton onClick={onBack}>
        {email ? 'Use a different email' : 'All sign-in options'}
      </BackButton>
      <StepHeader icon={<Mail className="h-5 w-5" strokeWidth={1.75} />} title="Check your email">
        {email ? (
          <>
            Enter the {EMAIL_CODE_LENGTH}-digit code we sent to{' '}
            <span className="font-medium text-foreground [overflow-wrap:anywhere]">{email}</span>.
          </>
        ) : (
          <>
            To finish linking Google, enter the {EMAIL_CODE_LENGTH}-digit code we sent to your
            email.
          </>
        )}
      </StepHeader>

      <form
        className="mt-7"
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {EMAIL_CODE_LENGTH}-digit code
        </label>
        <CodeInput
          ref={input}
          id={inputId}
          value={code}
          onChange={(value) => {
            setCode(value);
            if (error && !dead) setError(null);
          }}
          onComplete={(value) => void verify(value)}
          disabled={verifying || dead}
          invalid={Boolean(error) && !dead}
          describedBy={error || notice ? messageId : undefined}
        />

        <div id={messageId} className="mt-3 empty:hidden">
          {error && <InlineNotice>{error.message}</InlineNotice>}
          {!error && notice && <InlineNotice tone="info">{notice}</InlineNotice>}
        </div>

        <Button
          type="submit"
          className="mt-4 h-11 w-full text-[15px]"
          disabled={verifying || dead || code.length !== EMAIL_CODE_LENGTH}
        >
          {verifying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {verifying ? 'Checking code…' : 'Continue'}
        </Button>
      </form>

      {turnstile.widget && <div className="mt-3">{turnstile.widget}</div>}

      <div className="mt-5 text-center text-sm text-muted-foreground">
        {email ? (
          wait > 0 ? (
            <p aria-live="polite">
              Didn’t get it? Check spam, or resend in{' '}
              <span className="tabular-nums">
                {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, '0')}
              </span>
            </p>
          ) : (
            <p>
              Didn’t get it?{' '}
              <button
                type="button"
                onClick={() => void resend()}
                disabled={resending}
                className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
              >
                {resending ? 'Sending…' : 'Send a new code'}
              </button>
            </p>
          )
        ) : (
          <p>The code expires in 10 minutes.</p>
        )}
      </div>
    </>
  );
}

function NameStep({ client, onDone }: { client: SignInClient; onDone: () => void }) {
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState<'save' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const length = useMemo(() => [...name.trim()].length, [name]);

  async function save(skip: boolean) {
    if (saving) return;
    const value = skip ? null : normalizeDisplayName(name);
    if (!skip && !value) {
      setError(new SignInError('invalid_name').message);
      return;
    }
    setSaving(skip ? 'skip' : 'save');
    setError(null);
    try {
      await client.completeOnboarding(value);
      onDone();
    } catch (failure) {
      setError(
        failure instanceof SignInError ? failure.message : new SignInError('unavailable').message,
      );
      setSaving(null);
    }
  }

  return (
    <>
      <StepHeader
        icon={<UserRound className="h-5 w-5" strokeWidth={1.75} />}
        title="What should we call you?"
      >
        Add a name for your account. You can change it anytime in settings.
      </StepHeader>
      <form
        className="mt-7"
        onSubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
        noValidate
      >
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor={inputId} className="text-sm font-medium">
            Name
          </label>
          <span
            className={cn(
              'text-xs tabular-nums text-muted-foreground',
              length > DISPLAY_NAME_MAX_LENGTH && 'text-destructive',
            )}
            aria-hidden
          >
            {length}/{DISPLAY_NAME_MAX_LENGTH}
          </span>
        </div>
        <Input
          id={inputId}
          autoComplete="name"
          autoFocus
          placeholder="Your name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          maxLength={DISPLAY_NAME_MAX_LENGTH * 2}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-11 text-[15px]"
          disabled={saving !== null}
        />
        {error && (
          <div id={errorId} className="mt-2">
            <InlineNotice>{error}</InlineNotice>
          </div>
        )}
        <Button
          type="submit"
          className="mt-4 h-11 w-full text-[15px]"
          disabled={saving !== null || length === 0}
        >
          {saving === 'save' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Continue
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="mt-2 h-11 w-full text-[15px] text-muted-foreground"
          disabled={saving !== null}
          onClick={() => void save(true)}
        >
          {saving === 'skip' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Skip for now
        </Button>
      </form>
    </>
  );
}
