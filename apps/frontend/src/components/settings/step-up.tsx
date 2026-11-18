'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAccount, useChainId, useDisconnect, useSignMessage } from 'wagmi';
import { Loader2, Mail, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { CodeInput } from '@/components/sign-in/code-input';
import { WalletList } from '@/components/wallet/wallet-list';
import { AccountError } from '@/lib/account-client';
import { EMAIL_CODE_LENGTH } from '@/lib/sign-in-contract';
import { WALLET_STATEMENTS, buildWalletMessage } from '@/lib/wallet-message';
import { shortAddress } from '@/lib/utils';
import { useSettings } from './settings-context';

type Pending = {
  resolve: (approved: boolean) => void;
};

interface StepUpValue {
  /**
   * Runs a sensitive action. If the server asks for a fresh approval, the person approves with
   * their own method (email code or their linked wallet) and the action runs once more.
   */
  run: <T>(action: () => Promise<T>) => Promise<T>;
}

const StepUpContext = createContext<StepUpValue | null>(null);

export function useStepUp(): StepUpValue {
  const value = useContext(StepUpContext);
  if (!value) throw new Error('useStepUp must be used inside StepUpProvider');
  return value;
}

/** Cancelled approvals end the action quietly; callers treat this as "nothing happened". */
export class StepUpCancelled extends Error {
  constructor() {
    super('Approval cancelled');
    this.name = 'StepUpCancelled';
  }
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const approve = useCallback(() => new Promise<boolean>((resolve) => setPending({ resolve })), []);

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } catch (error) {
        if (!(error instanceof AccountError) || error.code !== 'step_up_required') throw error;
        const approved = await approve();
        if (!approved) throw new StepUpCancelled();
        return action();
      }
    },
    [approve],
  );

  return (
    <StepUpContext.Provider value={{ run }}>
      {children}
      {pending && (
        <StepUpDialog
          onDone={(approved) => {
            pending.resolve(approved);
            setPending(null);
          }}
        />
      )}
    </StepUpContext.Provider>
  );
}

function StepUpDialog({ onDone }: { onDone: (approved: boolean) => void }) {
  const { account } = useSettings();
  const canEmail = Boolean(account.email);
  const canWallet = Boolean(account.externalWallet);
  const preferWallet = canWallet && (account.createdWith === 'wallet' || !canEmail);
  const [method, setMethod] = useState<'email' | 'wallet'>(preferWallet ? 'wallet' : 'email');
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      title="Approve this change"
      description={
        method === 'email'
          ? 'For your security, confirm it’s you with a code sent to your email.'
          : 'For your security, confirm it’s you by signing with your linked wallet.'
      }
      onClose={() => onDone(false)}
      busy={busy}
    >
      {method === 'email' ? (
        <EmailApproval onApproved={() => onDone(true)} onBusy={setBusy} />
      ) : (
        <WalletApproval onApproved={() => onDone(true)} onBusy={setBusy} />
      )}
      {canEmail && canWallet && !busy && (
        <button
          type="button"
          onClick={() => setMethod(method === 'email' ? 'wallet' : 'email')}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {method === 'email' ? (
            <>
              <Wallet className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Use my wallet instead
            </>
          ) : (
            <>
              <Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Use an email code instead
            </>
          )}
        </button>
      )}
    </Dialog>
  );
}

function EmailApproval({
  onApproved,
  onBusy,
}: {
  onApproved: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { client, account } = useSettings();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'sending' | 'ready' | 'verifying'>('sending');
  const [code, setCode] = useState('');
  const [error, setError] = useState<AccountError | null>(null);
  const started = useRef(false);

  const send = useCallback(async () => {
    setState('sending');
    setError(null);
    setCode('');
    try {
      await client.stepUpEmailStart();
      setState('ready');
      window.setTimeout(() => input.current?.focus(), 0);
    } catch (failure) {
      setError(failure instanceof AccountError ? failure : new AccountError('unavailable'));
      setState('ready');
    }
  }, [client]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
  }, [send]);

  async function verify(value: string) {
    if (value.length !== EMAIL_CODE_LENGTH || state === 'verifying') return;
    setState('verifying');
    onBusy(true);
    setError(null);
    try {
      await client.stepUpEmailVerify(value);
      onApproved();
    } catch (failure) {
      setError(failure instanceof AccountError ? failure : new AccountError('unavailable'));
      setCode('');
      setState('ready');
      window.setTimeout(() => input.current?.focus(), 0);
    } finally {
      onBusy(false);
    }
  }

  const dead = error?.code === 'code_expired' || error?.code === 'too_many_attempts';

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {state === 'sending' ? (
          'Sending a code…'
        ) : (
          <>
            We sent a {EMAIL_CODE_LENGTH}-digit code to{' '}
            <span className="font-medium text-foreground [overflow-wrap:anywhere]">
              {account.email}
            </span>
            .
          </>
        )}
      </p>
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
        disabled={state !== 'ready' || dead}
        invalid={Boolean(error) && !dead}
      />
      {error && <InlineNotice className="mt-3">{error.message}</InlineNotice>}
      <div className="mt-4 flex flex-col gap-2">
        <Button
          type="button"
          className="h-11 w-full"
          disabled={state !== 'ready' || dead || code.length !== EMAIL_CODE_LENGTH}
          onClick={() => void verify(code)}
        >
          {state === 'verifying' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {state === 'verifying' ? 'Checking code…' : 'Approve'}
        </Button>
        {(dead || error?.code === 'rate_limited' || error?.code === 'unavailable') && (
          <Button type="button" variant="ghost" className="h-10 w-full" onClick={() => void send()}>
            Send a new code
          </Button>
        )}
      </div>
    </div>
  );
}

function WalletApproval({
  onApproved,
  onBusy,
}: {
  onApproved: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { client, account } = useSettings();
  const linked = account.externalWallet?.address ?? '';
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = Boolean(address && address.toLowerCase() === linked.toLowerCase());

  async function sign() {
    if (!address || !matches) return;
    setSigning(true);
    onBusy(true);
    setError(null);
    try {
      const nonce = await client.stepUpWalletNonce();
      const message = buildWalletMessage({
        address,
        chainId,
        nonce,
        statement: WALLET_STATEMENTS.approve,
      });
      const signature = await signMessageAsync({ account: address, message });
      await client.stepUpWallet(message, signature);
      onApproved();
    } catch (failure) {
      setError(
        failure instanceof AccountError
          ? failure.message
          : 'The signature wasn’t completed. Try again from your wallet.',
      );
    } finally {
      setSigning(false);
      onBusy(false);
    }
  }

  if (!isConnected || !address) {
    return (
      <div>
        <p className="mb-3 text-sm text-muted-foreground">
          Connect your linked wallet{' '}
          <span className="font-mono text-foreground">{shortAddress(linked)}</span>.
        </p>
        <WalletList />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background/50 px-3.5 py-3">
        <span
          className={
            matches
              ? 'h-2 w-2 rounded-full bg-[hsl(var(--brand-emerald))]'
              : 'h-2 w-2 rounded-full bg-destructive'
          }
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{shortAddress(address)}</span>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => void disconnectAsync().catch(() => undefined)}
          disabled={signing}
        >
          Use another wallet
        </button>
      </div>
      {!matches && (
        <InlineNotice tone="warning">
          This isn’t your linked wallet. Switch to {shortAddress(linked)} to approve.
        </InlineNotice>
      )}
      {error && <InlineNotice>{error}</InlineNotice>}
      <Button
        type="button"
        className="h-11 w-full"
        disabled={!matches || signing}
        onClick={() => void sign()}
      >
        {signing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {signing ? 'Confirm in your wallet' : 'Sign to approve'}
      </Button>
    </div>
  );
}
