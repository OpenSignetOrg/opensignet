'use client';

import { useId, useState } from 'react';
import { ArrowLeft, Check, Loader2, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { AccountError } from '@/lib/account-client';
import { cn, formatDate } from '@/lib/utils';
import { useSettings } from './settings-context';
import { SettingsCard } from './settings-ui';
import { StepUpCancelled, useStepUp } from './step-up';

function messageOf(error: unknown) {
  return error instanceof AccountError ? error.message : new AccountError('unavailable').message;
}

/** What a first delete does; each point is confirmed before the next step. */
const FIRST = [
  'Every automatic renewal, for my plan and my domains, turns off now, and I’m signed out everywhere.',
  'My account is deleted for good in 30 days. Signing in before then restores it.',
  'After that my plan is cancelled, my domains are no longer renewed or served by OpenSignet, and my data is deleted.',
  'My OpenSignet wallet is empty, or I’ve exported its key.',
] as const;

/** What a second delete within 30 days does: no restoring this time. */
const PERMANENT = [
  'My account is deleted for good right now. It can’t be restored by signing in.',
  'My plan is cancelled now, and my domains are no longer renewed or served by OpenSignet.',
  'My profile, sign-in methods, devices and data are deleted and can’t be recovered.',
  'My OpenSignet wallet is empty, or I’ve exported its key.',
] as const;

const CONFIRM_WORD = 'delete';

/**
 * Deleting the account (owner decision 2026-11-21). The first delete schedules it: renewals turn
 * off, the account is signed out, and signing in within 30 days restores it. A second delete
 * within 30 days of the first deletes it for good at once, with a stronger warning. Both go in
 * steps: confirm each point, type the word, then approve with a code or the linked wallet.
 */
export function DeleteAccountCard() {
  const { account, client } = useSettings();
  const { run } = useStepUp();
  const confirmId = useId();
  const permanentUntil = account.deletion?.permanentUntil ?? null;
  const permanent = Boolean(permanentUntil);
  const points = permanent ? PERMANENT : FIRST;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [agreed, setAgreed] = useState<boolean[]>(points.map(() => false));
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allAgreed = agreed.length === points.length && agreed.every(Boolean);

  function start() {
    setStep(1);
    setAgreed(points.map(() => false));
    setTyped('');
    setError(null);
    setOpen(true);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await run(() => client.deleteAccount(permanent));
      window.location.replace('/');
    } catch (failure) {
      if (!(failure instanceof StepUpCancelled)) setError(messageOf(failure));
      setBusy(false);
    }
  }

  return (
    <SettingsCard
      id="delete-account"
      tone="danger"
      title="Delete account"
      description={
        permanent
          ? 'Deleting your account now deletes it for good, right away. It can’t be restored.'
          : 'Your account is deleted in 30 days; signing in before then restores it. Automatic renewals turn off right away.'
      }
      footer={
        <>
          <span className="hidden sm:block" />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-9 w-full sm:w-auto"
            onClick={start}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {permanent ? 'Delete permanently' : 'Delete account'}
          </Button>
        </>
      }
    >
      {permanent && permanentUntil ? (
        <InlineNotice tone="warning">
          You deleted this account recently and signing in restored it. Deleting it again before{' '}
          {formatDate(permanentUntil)} deletes it permanently, with no 30 days to change your mind.
        </InlineNotice>
      ) : null}
      {open && (
        <Dialog
          title={
            step === 2
              ? permanent
                ? 'Delete your account for good?'
                : 'Delete your account?'
              : permanent
                ? 'This delete is permanent'
                : 'Before you delete your account'
          }
          description={
            step === 1
              ? 'Step 1 of 2. Confirm each point to continue.'
              : 'Step 2 of 2. After this you’ll approve with a code or your linked wallet.'
          }
          onClose={() => setOpen(false)}
          busy={busy}
        >
          {step === 1 ? (
            <div>
              {permanent ? (
                <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3 text-sm leading-5">
                  <TriangleAlert
                    className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span>
                    Your first delete was less than 30 days ago, so this one is final. Everything in
                    your account becomes unreachable at once.
                  </span>
                </div>
              ) : null}
              <ul className="flex flex-col gap-2">
                {points.map((text, index) => {
                  const checked = agreed[index] ?? false;
                  return (
                    <li key={text}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() =>
                          setAgreed((current) =>
                            current.map((value, at) => (at === index ? !value : value)),
                          )
                        }
                        className={cn(
                          'flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                          checked
                            ? 'border-destructive/40 bg-destructive/[0.05]'
                            : 'border-border/80 bg-background/50 hover:border-destructive/30',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            checked
                              ? 'border-destructive bg-destructive text-destructive-foreground'
                              : 'border-border bg-background',
                          )}
                        >
                          {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </span>
                        {text}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Keep my account
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!allAgreed}
                  onClick={() => setStep(2)}
                >
                  Continue
                </Button>
              </div>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (typed.trim().toLowerCase() === CONFIRM_WORD) void remove();
              }}
            >
              <label htmlFor={confirmId} className="mb-1.5 block text-sm">
                Type <span className="font-semibold">{CONFIRM_WORD}</span> to confirm
              </label>
              <Input
                id={confirmId}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="h-11"
                disabled={busy}
                autoFocus
              />
              {error && <InlineNotice className="mt-3">{error}</InlineNotice>}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(1)}
                  disabled={busy}
                  className="sm:-ml-2"
                >
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={busy || typed.trim().toLowerCase() !== CONFIRM_WORD}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {permanent ? 'Delete permanently' : 'Delete my account'}
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </SettingsCard>
  );
}
