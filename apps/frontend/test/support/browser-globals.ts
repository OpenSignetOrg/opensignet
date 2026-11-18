/**
 * Test hooks that browser fixtures install on `window`. Fixture code runs inside the page, so
 * these declarations only describe what the synthetic scripts expose to `page.evaluate` calls.
 */

export type WalletEventListener = (...args: unknown[]) => void;

export interface SyntheticWalletHooks {
  signatureRequests: number;
  switchAccount(next: string | null): void;
}

export interface SyntheticTurnstileWidget {
  callback(token: string): void;
  'error-callback'(): void;
  'expired-callback'(): void;
  [option: string]: unknown;
}

export interface SyntheticTurnstileHooks {
  widgets: SyntheticTurnstileWidget[];
  tokens: Array<Record<string, unknown>>;
  removed: string[];
  resets: string[];
}

export interface WidgetMountOptions {
  siteKey?: string;
  disabled?: boolean;
  callback?: string;
}

declare global {
  interface Window {
    syntheticVisibility?: DocumentVisibilityState;
    syntheticResolutionEvents: number;
    syntheticWallet: SyntheticWalletHooks;
    syntheticTurnstile: SyntheticTurnstileHooks;
    mountWidget(options?: WidgetMountOptions): void;
    unmountWidget(): void;
    fixtureCopied?: unknown;
    untrustedWalletExecuted?: boolean;
  }
}
