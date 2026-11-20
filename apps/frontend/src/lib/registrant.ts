import { z } from 'zod';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import { API_TIMEOUT_MS } from '@/lib/transport-policy';

/**
 * The domain owner's details (the registrant). Registries require them for every domain, so the
 * account saves them once and every registration reuses them. They stay private: domain privacy
 * hides them from public WHOIS.
 *
 *   GET /api/v1/registrant  -> { registrant: Registrant | null }
 *   PUT /api/v1/registrant  -> { registrant: Registrant }
 */

export const registrantSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    company: z.string().optional(),
    email: z.string(),
    phoneCountryCode: z.string(),
    phoneNumber: z.string(),
    street: z.string(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string(),
    country: z.string(),
  })
  .strict();
export type Registrant = z.infer<typeof registrantSchema>;

const answerSchema = z.object({ registrant: registrantSchema.nullable() }).strict();

export type RegistrantField = keyof Registrant;

export class RegistrantError extends Error {
  readonly kind: 'signin' | 'invalid' | 'unavailable';
  readonly field?: RegistrantField;
  constructor(
    kind: 'signin' | 'invalid' | 'unavailable',
    message?: string,
    field?: RegistrantField,
  ) {
    super(
      message ??
        (kind === 'signin'
          ? 'Your sign-in has ended. Sign in again to continue.'
          : 'Your details couldn’t be saved right now. Nothing changed; try again in a moment.'),
    );
    this.kind = kind;
    this.field = field;
  }
}

const errorSchema = z.object({
  message: z.string().optional(),
  details: z.object({ field: z.string().optional() }).optional(),
});

async function call(method: 'GET' | 'PUT', body?: Registrant, signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch('/api/v1/registrant', {
      method,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new RegistrantError('unavailable');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 401) throw new RegistrantError('signin');
  if (response.status === 422) {
    const parsed = errorSchema.safeParse(payload);
    const field = parsed.success ? parsed.data.details?.field : undefined;
    throw new RegistrantError(
      'invalid',
      parsed.success ? parsed.data.message : undefined,
      field && field in EMPTY_REGISTRANT ? (field as RegistrantField) : undefined,
    );
  }
  if (!response.ok) throw new RegistrantError('unavailable');
  const parsed = answerSchema.safeParse(payload);
  if (!parsed.success) throw new RegistrantError('unavailable');
  return parsed.data.registrant;
}

export const readRegistrant = (signal?: AbortSignal) => call('GET', undefined, signal);
export async function saveRegistrant(registrant: Registrant): Promise<Registrant> {
  const saved = await call('PUT', registrant);
  if (!saved) throw new RegistrantError('unavailable');
  return saved;
}

export const EMPTY_REGISTRANT: Registrant = {
  firstName: '',
  lastName: '',
  company: '',
  email: '',
  phoneCountryCode: '',
  phoneNumber: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
};

export interface CountryOption {
  code: CountryCode;
  name: string;
  dial: string;
}

let countries: CountryOption[] | null = null;

/** Every country with its name in English and its dialling code, sorted by name. */
export function countryOptions(): CountryOption[] {
  if (countries) return countries;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  countries = getCountries()
    .map((code) => ({
      code,
      name: names.of(code) ?? code,
      dial: `+${getCountryCallingCode(code)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return countries;
}

/** The person's likely country from the browser's language, when it names one. */
export function likelyCountry(): CountryCode | null {
  if (typeof navigator === 'undefined') return null;
  for (const language of navigator.languages ?? [navigator.language]) {
    const region = language.split('-')[1]?.toUpperCase();
    if (region && countryOptions().some((country) => country.code === region))
      return region as CountryCode;
  }
  return null;
}
