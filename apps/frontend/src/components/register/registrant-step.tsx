'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isPossiblePhoneNumber, type CountryCode } from 'libphonenumber-js/min';
import { Loader2, LockKeyhole, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineNotice } from '@/components/ui/inline-notice';
import { SelectMenu } from '@/components/ui/select-menu';
import { cn } from '@/lib/utils';
import {
  EMPTY_REGISTRANT,
  RegistrantError,
  countryOptions,
  likelyCountry,
  readRegistrant,
  saveRegistrant,
  type Registrant,
  type RegistrantField,
} from '@/lib/registrant';

type Errors = Partial<Record<RegistrantField, string>>;

/** What the form checks before sending; the server checks the same again. */
function check(form: Registrant, phoneCountry: CountryCode | ''): Errors {
  const errors: Errors = {};
  if (!form.firstName.trim()) errors.firstName = 'Enter your first name.';
  if (!form.lastName.trim()) errors.lastName = 'Enter your last name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    errors.email = 'Enter an email address you read, like name@example.com.';
  if (!form.country) errors.country = 'Choose your country.';
  if (!phoneCountry || !form.phoneNumber.trim()) errors.phoneNumber = 'Enter your phone number.';
  else if (!isPossiblePhoneNumber(form.phoneNumber, phoneCountry))
    errors.phoneNumber = 'This doesn’t look like a phone number for the chosen country code.';
  if (!form.street.trim()) errors.street = 'Enter your street address.';
  if (!form.city.trim()) errors.city = 'Enter your city.';
  if (form.postalCode && !/^[A-Za-z0-9 -]{1,16}$/.test(form.postalCode.trim()))
    errors.postalCode = 'Use letters, numbers, spaces or hyphens.';
  return errors;
}

/**
 * The domain owner's details, asked once per account on the register page. Registries require a
 * real owner for every domain; they are saved privately and reused for every domain after.
 */
export function RegistrantStep({
  step,
  accountEmail,
  disabled,
  onReadyChange,
}: {
  step: number;
  accountEmail: string | null;
  disabled?: boolean;
  onReadyChange: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<'loading' | 'saved' | 'editing' | 'failed'>('loading');
  const [saved, setSaved] = useState<Registrant | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    readRegistrant(controller.signal)
      .then((registrant) => {
        setSaved(registrant);
        setStatus(registrant ? 'saved' : 'editing');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('failed');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => onReadyChange(status === 'saved'), [status, onReadyChange]);

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:inline-flex">
          <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-[15px] font-semibold leading-6">
              <span className="text-muted-foreground">{step}.</span> Domain owner
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(143_35%_94%)] px-2 py-0.5 text-[11px] font-semibold text-[hsl(143_45%_24%)] ring-1 ring-inset ring-[hsl(143_30%_75%)]">
              <LockKeyhole className="h-3 w-3" aria-hidden />
              Private
            </span>
          </div>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
            Registries need the real owner of every domain. Add it once; it’s saved to your account
            and kept out of public WHOIS wherever the registry allows it.
          </p>
        </div>
      </div>
      {status === 'loading' ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Checking your saved details…
        </p>
      ) : status === 'failed' ? (
        <InlineNotice className="mt-4">
          Your saved details couldn’t be loaded. Check your connection and refresh the page.
        </InlineNotice>
      ) : status === 'saved' && saved ? (
        <Summary registrant={saved} disabled={disabled} onEdit={() => setStatus('editing')} />
      ) : (
        <RegistrantForm
          initial={saved}
          accountEmail={accountEmail}
          disabled={disabled}
          onCancel={saved ? () => setStatus('saved') : undefined}
          onSaved={(registrant) => {
            setSaved(registrant);
            setStatus('saved');
          }}
        />
      )}
    </div>
  );
}

function Summary({
  registrant,
  disabled,
  onEdit,
}: {
  registrant: Registrant;
  disabled?: boolean;
  onEdit: () => void;
}) {
  const country =
    countryOptions().find((option) => option.code === registrant.country)?.name ??
    registrant.country;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/70 bg-background/50 p-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/80 text-muted-foreground ring-1 ring-inset ring-border/70">
        <UserRound className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {registrant.firstName} {registrant.lastName}
          {registrant.company ? (
            <span className="font-normal text-muted-foreground"> · {registrant.company}</span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
          {registrant.city}, {country}
        </p>
        <p className="truncate text-xs leading-5 text-muted-foreground">{registrant.email}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 px-2.5 text-xs"
        onClick={onEdit}
        disabled={disabled}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
      </Button>
    </div>
  );
}

function Field({
  label,
  optional,
  error,
  className,
  children,
  id,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium">
        {label}
        {optional ? <span className="font-normal text-muted-foreground">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RegistrantForm({
  initial,
  accountEmail,
  disabled,
  onCancel,
  onSaved,
}: {
  initial: Registrant | null;
  accountEmail: string | null;
  disabled?: boolean;
  onCancel?: () => void;
  onSaved: (registrant: Registrant) => void;
}) {
  const base = useId();
  const id = (field: string) => `${base}-${field}`;
  const countries = useMemo(() => countryOptions(), []);
  const phoneField = useRef<HTMLDivElement>(null);
  const guess = useMemo(() => likelyCountry(), []);
  const [form, setForm] = useState<Registrant>(() => ({
    ...EMPTY_REGISTRANT,
    ...initial,
    email: initial?.email ?? accountEmail ?? '',
    country: initial?.country ?? guess ?? '',
  }));
  const [phoneCountry, setPhoneCountry] = useState<CountryCode | ''>(() => {
    if (initial) {
      const match = countries.find(
        (option) =>
          option.dial === initial.phoneCountryCode &&
          (option.code === initial.country ||
            !countries.some(
              (other) => other.code === initial.country && other.dial === option.dial,
            )),
      );
      return match?.code ?? '';
    }
    return guess ?? '';
  });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const countryChoices = useMemo(
    () => [
      { value: '', label: 'Choose a country' },
      ...countries.map((option) => ({
        value: option.code,
        label: option.name,
        keywords: option.code,
      })),
    ],
    [countries],
  );
  const dialChoices = useMemo(
    () => [
      { value: '', label: 'Code' },
      ...countries.map((option) => ({
        value: option.code,
        label: option.name,
        hint: option.dial,
        keywords: `${option.code} ${option.dial}`,
      })),
    ],
    [countries],
  );

  const set = (field: RegistrantField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFailure(null);
    const found = check(form, phoneCountry);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(id(first))?.focus();
      return;
    }
    setSaving(true);
    try {
      const dial = countries.find((option) => option.code === phoneCountry)?.dial ?? '';
      const registrant = await saveRegistrant({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.company?.trim() ? { company: form.company.trim() } : {}),
        email: form.email.trim(),
        phoneCountryCode: dial,
        phoneNumber: form.phoneNumber.trim(),
        street: form.street.trim(),
        city: form.city.trim(),
        ...(form.state?.trim() ? { state: form.state.trim() } : {}),
        postalCode: form.postalCode.trim(),
        country: form.country,
      });
      onSaved(registrant);
    } catch (error) {
      if (error instanceof RegistrantError && error.kind === 'invalid' && error.field) {
        setErrors({ [error.field]: error.message });
        document.getElementById(id(error.field))?.focus();
      } else {
        setFailure(
          error instanceof RegistrantError
            ? error.message
            : 'Your details couldn’t be saved right now. Nothing changed; try again in a moment.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const input = (field: RegistrantField, extra: Record<string, string> = {}) => ({
    id: id(field),
    value: form[field] ?? '',
    onChange: (event: { target: { value: string } }) => set(field, event.target.value),
    disabled: disabled || saving,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id(field)}-error` : undefined,
    className: cn(errors[field] && 'border-destructive/70'),
    ...extra,
  });

  return (
    <form onSubmit={submit} noValidate className="mt-3">
      <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <Field label="First name" id={id('firstName')} error={errors.firstName}>
          <Input {...input('firstName', { autoComplete: 'given-name' })} />
        </Field>
        <Field label="Last name" id={id('lastName')} error={errors.lastName}>
          <Input {...input('lastName', { autoComplete: 'family-name' })} />
        </Field>
        <Field label="Email" id={id('email')} error={errors.email} className="sm:col-span-2">
          <Input
            {...input('email', { autoComplete: 'email', type: 'email', inputMode: 'email' })}
          />
        </Field>
        <Field label="Country" id={id('country')} error={errors.country}>
          <SelectMenu
            id={id('country')}
            ariaLabel="Country"
            value={form.country}
            options={countryChoices}
            onChange={(value) => {
              set('country', value);
              if (value && !form.phoneNumber) setPhoneCountry(value as CountryCode);
            }}
            disabled={disabled || saving}
            searchable
            searchLabel="Search countries"
            menuMinWidth={260}
            triggerClassName={cn(
              'h-10 sm:h-10 sm:w-full font-normal',
              !form.country && 'text-muted-foreground',
              errors.country && 'border-destructive/70',
            )}
          />
        </Field>
        <Field label="Phone" id={id('phoneNumber')} error={errors.phoneNumber}>
          {/* One field: the country code sits inside it, like the number's own prefix. */}
          <div
            ref={phoneField}
            className={cn(
              'flex h-10 min-w-0 items-stretch overflow-hidden rounded-md border border-input bg-background/70 shadow-[inset_0_1px_3px_rgba(20,21,18,0.08),inset_0_1px_0_rgba(255,255,255,0.72)] focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-ring/40',
              errors.phoneNumber && 'border-destructive/70',
            )}
          >
            <SelectMenu
              ariaLabel="Phone country code"
              value={phoneCountry}
              options={dialChoices}
              valueLabel={countries.find((option) => option.code === phoneCountry)?.dial ?? 'Code'}
              onChange={(value) => {
                setPhoneCountry(value as CountryCode | '');
                if (errors.phoneNumber)
                  setErrors((current) => ({ ...current, phoneNumber: undefined }));
              }}
              disabled={disabled || saving}
              searchable
              searchLabel="Search countries or codes"
              anchorRef={phoneField}
              menuMinWidth={300}
              className="shrink-0"
              triggerClassName="h-full w-auto min-w-0 gap-1 rounded-none border-0 border-r border-input/80 bg-secondary/50 px-3 font-mono text-[13px] font-medium shadow-none hover:bg-secondary sm:h-full sm:w-auto sm:min-w-0"
            />
            <input
              {...input('phoneNumber', {
                autoComplete: 'tel-national',
                type: 'tel',
                inputMode: 'tel',
                placeholder: 'Phone number',
              })}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </Field>
        <Field
          label="Street address"
          id={id('street')}
          error={errors.street}
          className="sm:col-span-2"
        >
          <Input
            {...input('street', {
              autoComplete: 'street-address',
              placeholder: 'House, road and area',
            })}
          />
        </Field>
        <Field label="City" id={id('city')} error={errors.city}>
          <Input {...input('city', { autoComplete: 'address-level2' })} />
        </Field>
        <Field label="Postal code" id={id('postalCode')} error={errors.postalCode} optional>
          <Input {...input('postalCode', { autoComplete: 'postal-code' })} />
        </Field>
        <Field label="State or region" id={id('state')} error={errors.state} optional>
          <Input {...input('state', { autoComplete: 'address-level1' })} />
        </Field>
        <Field label="Company" id={id('company')} error={errors.company} optional>
          <Input {...input('company', { autoComplete: 'organization' })} />
        </Field>
      </div>
      {failure ? <InlineNotice className="mt-4">{failure}</InlineNotice> : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={disabled || saving} className="sm:min-w-[11rem]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {saving ? 'Saving…' : 'Save owner details'}
        </Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        A change applies to domains you register next. To change the owner of a domain you already
        have, contact support.
      </p>
    </form>
  );
}
