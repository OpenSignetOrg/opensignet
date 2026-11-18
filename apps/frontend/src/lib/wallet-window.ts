import type { WalletWindowPurpose } from './account-client';

/**
 * The OpenSignet wallet window: a popup on its own origin where the wallet key is created,
 * unlocked and shown. Passkeys belong to that origin, so nothing on this site, including its
 * scripts, can ever reach the key. The site only opens the window with a single-use token in the
 * URL fragment (never sent to a server) and listens for the window's origin-checked messages.
 */
export const WALLET_WINDOW_ORIGIN = (() => {
  const configured =
    process.env.NEXT_PUBLIC_WALLET_FRAME_ORIGIN ||
    // Local development: the identity service serves the window on its own port. Passkeys need a
    // host name, so this must be localhost rather than an IP address.
    (process.env.NODE_ENV === 'development' ? 'http://localhost:8788' : '');
  try {
    return configured ? new URL(configured).origin : '';
  } catch {
    return '';
  }
})();

const PATHS: Record<WalletWindowPurpose, string> = {
  setup: '/setup',
  export: '/export',
  add_passkey: '/add-passkey',
  recovery_kit: '/recovery-kit',
  recover: '/recover',
};

const WIDTH = 460;
const HEIGHT = 680;

export type WalletWindowResult =
  'created' | 'exported' | 'passkey_added' | 'recovery_kit_created' | 'recovered' | 'closed';

const REPORTS: readonly WalletWindowResult[] = [
  'created',
  'exported',
  'passkey_added',
  'recovery_kit_created',
  'recovered',
];

export class WalletWindowError extends Error {
  readonly reason: 'blocked' | 'unavailable';
  constructor(reason: 'blocked' | 'unavailable') {
    super(reason);
    this.reason = reason;
  }
}

/**
 * Opens the window right away (inside the click, so browsers allow it), then loads it once the
 * token arrives. Resolves with what the window reported, or 'closed' if the person closed it.
 */
export async function openWalletWindow(
  purpose: WalletWindowPurpose,
  getToken: () => Promise<string>,
  /** Called as soon as the window reports success, while it may still be open. */
  onReport?: (result: Exclude<WalletWindowResult, 'closed'>) => void,
): Promise<WalletWindowResult> {
  if (!WALLET_WINDOW_ORIGIN) throw new WalletWindowError('unavailable');
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - WIDTH) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - HEIGHT) / 3));
  const popup = window.open(
    'about:blank',
    'opensignet-wallet',
    `popup=yes,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`,
  );
  if (!popup) throw new WalletWindowError('blocked');

  let token: string;
  try {
    token = await getToken();
  } catch (error) {
    popup.close();
    throw error;
  }
  popup.location.replace(`${WALLET_WINDOW_ORIGIN}${PATHS[purpose]}#${token}`);
  popup.focus();

  return new Promise<WalletWindowResult>((resolve) => {
    let reported: WalletWindowResult | null = null;
    function finish(result: WalletWindowResult) {
      window.removeEventListener('message', onMessage);
      window.clearInterval(watcher);
      resolve(result);
    }
    function onMessage(event: MessageEvent<unknown>) {
      if (event.origin !== WALLET_WINDOW_ORIGIN || event.source !== popup) return;
      const data = event.data as { source?: unknown; event?: unknown } | null;
      if (data?.source !== 'opensignet-wallet') return;
      const report = REPORTS.find((name) => name === data.event);
      if (!reported && report && report !== 'closed') {
        reported = report;
        onReport?.(report);
      }
    }
    // The window stays open after it reports (to show the key or a confirmation), so the result
    // is delivered when the person closes it.
    const watcher = window.setInterval(() => {
      if (popup.closed) finish(reported ?? 'closed');
    }, 400);
    window.addEventListener('message', onMessage);
  });
}
