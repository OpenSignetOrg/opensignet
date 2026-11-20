'use client';

import { useId, useState } from 'react';
import { ArrowLeft, Check, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { AccountError } from '@/lib/account-client';
import { cn } from '@/lib/utils';
import { useSettings } from './settings-context';
import { SettingsCard } from './settings-ui';
import { StepUpCancelled, useStepUp } from './step-up';

function messageOf(error: unknown) {
  return error instanceof AccountError ? error.message : new AccountError('unavailable').message;
}

const CONFIRM_WORD = 'delete';

/** What deleting the account does; each one is confirmed before the final step. */
const CONSEQUENCES = [
  'My profile, sign-in methods, devices and settings are deleted for good.',
  'Domains and inboxes on this account can’t be managed any more. I’ve moved any I want to keep.',
  'My OpenSignet wallet is empty, or I’ve exported its key.',
] as const;

/**
 * Deleting the account, in three steps: confirm each consequence, type the word, then approve
 * with a code or the linked wallet. Nothing is deleted before the last step.
 */
export function DeleteAccountCard() {
  const { client } = useSettings();
  const { run } = useStepUp();
  const confirmId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [agreed, setAgreed] = useState<boolean[]>(CONSEQUENCES.map(() => false));
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allAgreed = agreed.every(Boolean);

  function start() {
    setStep(1);
    setAgreed(CONSEQUENCES.map(() => false));
    setTyped('');
    setError(null);
    setOpen(true);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await run(() => client.deleteAccount());
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
      description="Permanently delete your OpenSignet account. You’ll confirm what this means, type a word, then approve it. This can’t be undone."
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
            Delete account
          </Button>
        </>
      }
    >
      {open && (
        <Dialog
          title={step === 1 ? 'Before you delete your account' : 'Delete your account?'}
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
              <ul className="flex flex-col gap-2">
                {CONSEQUENCES.map((text, index) => {
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
                  Delete my account
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </SettingsCard>
  );
}
