import type { OpenSignet } from '@opensignet/sdk';

export interface OpenSignetToolsOptions {
  /**
   * The host-configured SDK client every tool calls (an identity's API key or a wallet). Trusted
   * application configuration only: never built from model arguments.
   */
  apiClient: OpenSignet;
  /** Add `set_auto_renew`, which turns a domain's automatic renewal on or off. Defaults to false. */
  allowRenewalChanges?: boolean;
}

export type OpenSignetToolErrorCode =
  'API_UNAVAILABLE' | 'RENEWAL_APPROVAL_REQUIRED' | 'CARD_UNAVAILABLE' | 'DOMAIN_NOT_REGISTERED';

export type OpenSignetToolResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: OpenSignetToolErrorCode; message: string } };
