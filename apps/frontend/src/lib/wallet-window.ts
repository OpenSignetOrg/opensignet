/**
 * The OpenSignet wallet window: a popup on its own origin where the wallet key is shown after an
 * export is approved. The key reaches the window encrypted to a one-time key the window made
 * itself, so nothing on this site, including its scripts, can ever read it. The site only opens
 * the window with a single-use token in the URL fragment (never sent to a server), listens for
 * the window's origin-checked messages, and, when the export is approved with the linked wallet,
 * relays the signing request to that wallet.
 */
export const WALLET_WINDOW_ORIGIN = (() => {
  const configured =
    process.env.NEXT_PUBLIC_WALLET_FRAME_ORIGIN ||
    // Local development: the identity service serves the window on its own port.
    (process.env.NODE_ENV === 'development' ? 'http://localhost:8788' : '');
  try {
    return configured ? new URL(configured).origin : '';
  } catch {
    return '';
  }
})();

const WIDTH = 460;
const HEIGHT = 680;

export type WalletWindowResult = 'exported' | 'closed';

/** The window asks the linked wallet to sign this exact approval message. */
export interface SignRequest {
  challengeId: string;
  message: string;
  /** The checksummed address that must sign. */
  approver: string;
}

export class WalletWindowError extends Error {
  readonly reason: 'blocked' | 'unavailable';
  constructor(reason: 'blocked' | 'unavailable') {
    super(reason);
    this.reason = reason;
  }
}

export interface WalletWindowHandlers {
  /** Called as soon as the window reports the export, while it stays open to show the key. */
  onExported?: () => void;
  /** Signs a wallet approval; rejecting tells the window the person cancelled. */
  onSignRequest?: (request: SignRequest) => Promise<string>;
}

/**
 * Opens the window right away (inside the click, so browsers allow it), then loads it once the
 * token arrives. Resolves with what the window reported, or 'closed' if the person closed it.
 */
export async function openWalletWindow(
  getToken: () => Promise<string>,
  handlers: WalletWindowHandlers = {},
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
  popup.location.replace(`${WALLET_WINDOW_ORIGIN}/export#${token}`);
  popup.focus();

  function reply(message: Record<string, unknown>) {
    try {
      popup?.postMessage({ source: 'opensignet-site', ...message }, WALLET_WINDOW_ORIGIN);
    } catch {
      // The window was closed; nothing to answer.
    }
  }

  return new Promise<WalletWindowResult>((resolve) => {
    let reported: WalletWindowResult | null = null;
    function finish(result: WalletWindowResult) {
      window.removeEventListener('message', onMessage);
      window.clearInterval(watcher);
      resolve(result);
    }
    function onMessage(event: MessageEvent<unknown>) {
      if (event.origin !== WALLET_WINDOW_ORIGIN || event.source !== popup) return;
      const data = event.data as {
        source?: unknown;
        event?: unknown;
        challengeId?: unknown;
        message?: unknown;
        approver?: unknown;
      } | null;
      if (data?.source !== 'opensignet-wallet') return;
      if (data.event === 'exported' && !reported) {
        reported = 'exported';
        handlers.onExported?.();
      }
      if (
        data.event === 'sign_request' &&
        typeof data.challengeId === 'string' &&
        typeof data.message === 'string' &&
        typeof data.approver === 'string'
      ) {
        const challengeId = data.challengeId;
        const sign = handlers.onSignRequest;
        if (!sign) {
          reply({ event: 'sign_cancelled', challengeId });
          return;
        }
        sign({ challengeId, message: data.message, approver: data.approver }).then(
          (signature) => reply({ event: 'signature', challengeId, signature }),
          () => reply({ event: 'sign_cancelled', challengeId }),
        );
      }
    }
    // The window stays open after it reports (to show the key), so the result is delivered when
    // the person closes it.
    const watcher = window.setInterval(() => {
      if (popup.closed) finish(reported ?? 'closed');
    }, 400);
    window.addEventListener('message', onMessage);
  });
}
