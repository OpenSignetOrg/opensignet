import type {
  OpenSignet,
  IdentityInspectionErrorCode,
  IdentityInspectionOptions,
  RenewalWorkflowErrorCode,
} from '@opensignet/sdk';

export interface OpenSignetToolsOptions {
  /** Trusted host configuration only. Must disable CCIP Read. No model-controlled RPC URLs. */
  publicClient?: IdentityInspectionOptions['publicClient'];
  /**
   * Explicitly configured SDK client for API reads. Registration status uses
   * the SDK's payer authentication, not the ordinary API key alone.
   */
  apiClient?: OpenSignet;
  /** Add unsigned auto-renew planning only. No execution tool exists. Defaults to false. */
  includeUnsignedPlans?: boolean;
}

export type OpenSignetToolErrorCode =
  IdentityInspectionErrorCode | RenewalWorkflowErrorCode | 'API_UNAVAILABLE';

export type OpenSignetToolResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: OpenSignetToolErrorCode; message: string } };
