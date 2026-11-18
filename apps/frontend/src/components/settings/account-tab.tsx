'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { AccountError } from '@/lib/account-client';
import { AVATAR_CHANGES_PER_MONTH, AVATAR_MAX_BYTES, AVATAR_TYPES } from '@/lib/account-contract';
import { normalizeDisplayName } from '@/lib/sign-in-client';
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/sign-in-contract';
import { formatDate } from '@/lib/utils';
import { AccountAvatar } from './account-avatar';
import { useSettings } from './settings-context';
import { SettingsCard } from './settings-ui';
import { StepUpCancelled, useStepUp } from './step-up';

export function AccountTab() {
  return (
    <>
      <ProfileCard />
      <DeleteAccountCard />
    </>
  );
}

function messageOf(error: unknown) {
  return error instanceof AccountError ? error.message : new AccountError('unavailable').message;
}

function ProfileCard() {
  const { client, account, update } = useSettings();
  const nameId = useId();
  const nameErrorId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(account.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState<'upload' | 'remove' | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => setName(account.displayName ?? ''), [account.displayName]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.preview);
    },
    [photo],
  );

  const normalized = normalizeDisplayName(name);
  const changed = (normalized ?? '') !== (account.displayName ?? '');
  const left = account.avatar.changesRemaining;
  const resetsOn = formatDate(account.avatar.resetsAt);

  async function saveName() {
    if (savingName || !changed) return;
    if (name.trim() && !normalized) {
      setNameError(new AccountError('invalid_name').message);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      update(await client.updateName(normalized));
      toast.success('Name updated');
    } catch (error) {
      setNameError(messageOf(error));
    } finally {
      setSavingName(false);
    }
  }

  function choose(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    if (!(AVATAR_TYPES as readonly string[]).includes(file.type) || file.size > AVATAR_MAX_BYTES) {
      setPhotoError(new AccountError('invalid_image').message);
      return;
    }
    setPhoto({ file, preview: URL.createObjectURL(file) });
  }

  async function uploadPhoto() {
    if (!photo) return;
    setPhotoBusy('upload');
    setPhotoError(null);
    try {
      update(await client.uploadAvatar(photo.file));
      setPhoto(null);
      toast.success('Photo updated');
    } catch (error) {
      setPhotoError(messageOf(error));
      setPhoto(null);
    } finally {
      setPhotoBusy(null);
    }
  }

  async function removePhoto() {
    setPhotoBusy('remove');
    setPhotoError(null);
    try {
      update(await client.removeAvatar());
      toast.success('Photo removed');
    } catch (error) {
      setPhotoError(messageOf(error));
    } finally {
      setPhotoBusy(null);
    }
  }

  return (
    <SettingsCard
      id="profile"
      title="Profile"
      description="Your name and photo appear on your account and in messages from OpenSignet."
      footer={
        <>
          <p className="text-xs text-muted-foreground">
            Names can use up to {DISPLAY_NAME_MAX_LENGTH} characters.
          </p>
          <Button
            type="submit"
            form="profile-name"
            size="sm"
            className="h-9 w-full sm:w-auto"
            disabled={!changed || savingName}
          >
            {savingName && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save name
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <AccountAvatar
          url={account.avatar.url}
          name={account.displayName}
          email={account.email}
          size={72}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={left === 0 || photoBusy !== null}
              onClick={() => fileInput.current?.click()}
            >
              <ImageUp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {account.avatar.url ? 'Change photo' : 'Upload photo'}
            </Button>
            {account.avatar.url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 text-muted-foreground"
                disabled={photoBusy !== null}
                onClick={() => void removePhoto()}
              >
                {photoBusy === 'remove' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            PNG, JPG or WebP, up to 5 MB.{' '}
            {left > 0
              ? `${left} of ${AVATAR_CHANGES_PER_MONTH} photo changes left this month.`
              : `No photo changes left this month. You can change it again on ${resetsOn}.`}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept={AVATAR_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </div>
      {photoError && <InlineNotice className="mt-4">{photoError}</InlineNotice>}

      <form
        id="profile-name"
        className="mt-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void saveName();
        }}
      >
        <label htmlFor={nameId} className="mb-1.5 block text-sm font-medium">
          Name
        </label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(null);
          }}
          autoComplete="name"
          placeholder="Your name"
          maxLength={DISPLAY_NAME_MAX_LENGTH * 2}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? nameErrorId : undefined}
          className="h-11 max-w-md"
          disabled={savingName}
        />
        {nameError && (
          <div id={nameErrorId} className="mt-2 max-w-md">
            <InlineNotice>{nameError}</InlineNotice>
          </div>
        )}
      </form>

      {photo && (
        <Dialog
          title="Use this photo?"
          description={`This uses 1 of your ${left} remaining photo ${left === 1 ? 'change' : 'changes'} this month.`}
          onClose={() => setPhoto(null)}
          busy={photoBusy === 'upload'}
        >
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- Local preview of the chosen file. */}
            <img
              src={photo.preview}
              alt="Selected photo preview"
              className="h-40 w-40 rounded-full border border-border/80 object-cover"
            />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            We crop it to a circle and remove hidden details like location before saving.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPhoto(null)}
              disabled={photoBusy === 'upload'}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void uploadPhoto()}
              disabled={photoBusy === 'upload'}
            >
              {photoBusy === 'upload' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save photo
            </Button>
          </div>
        </Dialog>
      )}
    </SettingsCard>
  );
}

const CONFIRM_WORD = 'delete';

function DeleteAccountCard() {
  const { client } = useSettings();
  const { run } = useStepUp();
  const confirmId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      description="Permanently delete your OpenSignet account, sign-in methods and settings. Your wallet must be empty or exported first. This can’t be undone."
      footer={
        <>
          <span className="hidden sm:block" />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-9 w-full sm:w-auto"
            onClick={() => {
              setTyped('');
              setError(null);
              setOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Delete account
          </Button>
        </>
      }
    >
      {open && (
        <Dialog
          title="Delete your account?"
          description="Your account, linked sign-in methods and settings will be deleted. This can’t be undone."
          onClose={() => setOpen(false)}
          busy={busy}
        >
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
            />
            {error && <InlineNotice className="mt-3">{error}</InlineNotice>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={busy || typed.trim().toLowerCase() !== CONFIRM_WORD}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Delete account
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </SettingsCard>
  );
}
