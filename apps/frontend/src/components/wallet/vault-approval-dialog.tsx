'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Loader2, Mail, RefreshCw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { CodeInput } from '@/components/sign-in/code-input';
import { LinkedWalletSigner } from '@/components/wallet/linked-wallet-signer';
import { AccountError, createAccountClient } from '@/lib/account-client';
import type { VaultChallenge, WalletApprover } from '@/lib/account-contract';
import { EMAIL_CODE_LENGTH } from '@/lib/sign-in-contract';
import { sealProof } from '@/lib/vault-seal';

/**
 * Approves one wallet action with the wallet vault: a code the vault emails, or a signature from
 * the linked wallet. The proof is sealed in this browser to the vault's key, then `onApproved`
 * carries out the action. Used for approver changes and wallet payments.
 */
export function VaultApprovalDialog({
  title,
  emailDescription,
  walletDescription,
  approvers,
  start,
  onApproved,
  onClose,
  children,
}: {
  title: string;
  emailDescription: string;
  walletDescription: string;
  /** The wallet's current approvers (decides which methods are offered). */
  approvers: WalletApprover[];
  start: (factor: 'email' | 'wallet') => Promise<VaultChallenge>;
  /** Runs once the vault has accepted the proof. */
  onApproved: (challenge: VaultChallenge) => Promise<void>;
  onClose: () => void;
  /** Shown above the approval, e.g. the amount being paid. */
  children?: ReactNode;
}) {
  const canEmail = approvers.some((approver) => approver.kind === 'email');
  const canWallet = approvers.some((approver) => approver.kind === 'wallet');
  const [factor, setFactor] = useState<'email' | 'wallet'>(canEmail ? 'email' : 'wallet');
  const [challenge, setChallenge] = useState<VaultChallenge | null>(null);
  const [starting, setStarting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountError | null>(null);
  const [code, setCode] = useState('');
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  const begin = useCallback(
    async (chosen: 'email' | 'wallet') => {
      setStarting(true);
      setError(null);
      setCode('');
      setChallenge(null);
      try {
        setChallenge(await start(chosen));
        if (chosen === 'email') window.setTimeout(() => input.current?.focus(), 0);
      } catch (failure) {
        setError(failure instanceof AccountError ? failure : new AccountError('unavailable'));
      } finally {
        setStarting(false);
      }
    },
    [start],
  );

  // One approval per chosen method: never send two codes for one action.
  const startedFor = useRef<'email' | 'wallet' | null>(null);
  useEffect(() => {
    if (startedFor.current === factor) return;
    startedFor.current = factor;
    void begin(factor);
  }, [factor, begin]);

  async function finish(proof: { code?: string; signature?: string }) {
    if (!challenge) return;
    const client = createAccountClient();
    const vaultKey = await client.vaultKey();
    const sealed = await sealProof(vaultKey, { challengeId: challenge.challengeId, ...proof });
    await client.completeApproval(challenge.challengeId, sealed);
    await onApproved(challenge);
  }

  async function verify(value: string) {
    if (value.length !== EMAIL_CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      await finish({ code: value });
    } catch (failure) {
      setError(failure instanceof AccountError ? failure : new AccountError('unavailable'));
      setCode('');
      window.setTimeout(() => input.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  const dead =
    error?.code === 'code_expired' ||
    error?.code === 'too_many_attempts' ||
    error?.code === 'approval_required';

  return (
    <Dialog
      title={title}
      description={factor === 'email' ? emailDescription : walletDescription}
      onClose={onClose}
      busy={busy}
    >
      {children}
      {starting ? (
        <p role="status" className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {factor === 'email' ? 'Sending a code…' : 'Preparing the approval…'}
        </p>
      ) : challenge && factor === 'email' ? (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            We sent a {EMAIL_CODE_LENGTH}-digit code to{' '}
            <span className="font-medium text-foreground">{challenge.sentTo}</span>.
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
            disabled={busy || dead}
            invalid={Boolean(error) && !dead}
          />
          {error && <InlineNotice className="mt-3">{error.message}</InlineNotice>}
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              className="h-11 w-full"
              disabled={busy || dead || code.length !== EMAIL_CODE_LENGTH}
              onClick={() => void verify(code)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {busy ? 'Checking code…' : 'Approve'}
            </Button>
            {dead && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full"
                onClick={() => void begin('email')}
              >
                Send a new code
              </Button>
            )}
          </div>
        </div>
      ) : challenge && challenge.message ? (
        <>
          {error && <InlineNotice className="mb-3">{error.message}</InlineNotice>}
          <LinkedWalletSigner
            expected={challenge.sentTo}
            message={challenge.message}
            onBusy={setBusy}
            onSigned={(signature) => finish({ signature })}
          />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {error && <InlineNotice>{error.message}</InlineNotice>}
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full"
            onClick={() => void begin(factor)}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Try again
          </Button>
        </div>
      )}
      {canEmail && canWallet && !busy && (
        <button
          type="button"
          onClick={() => setFactor(factor === 'email' ? 'wallet' : 'email')}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {factor === 'email' ? (
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
