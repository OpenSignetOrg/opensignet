import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors/coinbaseWallet';
import { injected } from 'wagmi/connectors/injected';
import { walletConnect } from 'wagmi/connectors/walletConnect';
import { BRAND_ASSETS } from '@/lib/brand-assets';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';
const WALLET_STORAGE_KEYS = new Set([
  'wagmi.store',
  'wagmi.recentconnectorid',
  'wagmi.walletconnect.requestedchains',
]);

type InjectedProvider = {
  isMetaMask?: true;
  isRabby?: true;
  isCoinbaseWallet?: true;
  isBaseWallet?: true;
  providers?: InjectedProvider[];
};

function getInjectedProvider(window: unknown, predicate: (provider: InjectedProvider) => boolean) {
  const ethereum = (window as { ethereum?: InjectedProvider } | undefined)?.ethereum;
  const providers = ethereum?.providers ?? (ethereum ? [ethereum] : []);
  return providers.find(predicate) as never;
}

// One wallet configuration per page: WalletConnect must be initialised only once (React's
// development double render would otherwise create a second client).
let browserConfig: ReturnType<typeof createWagmiConfig> | null = null;

export function getWagmiConfig() {
  if (typeof window === 'undefined') return createWagmiConfig();
  browserConfig ??= createWagmiConfig();
  return browserConfig;
}

function createWagmiConfig() {
  const canUseWalletConnect = typeof window !== 'undefined' && projectId;
  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://opensignet.com';

  return createConfig({
    chains: [base],
    connectors: [
      // Coinbase Wallet: 'all' lets user choose Smart Wallet or EOA
      coinbaseWallet({
        appName: 'OpenSignet',
        preference: { options: 'all' },
      }),
      // Injected: MetaMask, Rabby, Coinbase Wallet, etc.
      injected({ shimDisconnect: true }),
      injected({
        shimDisconnect: true,
        target: {
          id: 'metaMask',
          name: 'MetaMask',
          provider: (window) =>
            getInjectedProvider(
              window,
              (provider) =>
                Boolean(provider.isMetaMask) &&
                !provider.isRabby &&
                !provider.isCoinbaseWallet &&
                !provider.isBaseWallet,
            ),
        },
      }),
      injected({
        shimDisconnect: true,
        target: {
          id: 'rabby',
          name: 'Rabby',
          provider: (window) =>
            getInjectedProvider(window, (provider) => Boolean(provider.isRabby)),
        },
      }),
      injected({
        shimDisconnect: true,
        target: {
          id: 'baseApp',
          name: 'Coinbase Wallet',
          provider: (window) =>
            getInjectedProvider(window, (provider) =>
              Boolean(provider.isCoinbaseWallet || provider.isBaseWallet),
            ),
        },
      }),
      // WalletConnect: 300+ mobile wallets
      ...(canUseWalletConnect
        ? [
            walletConnect({
              projectId,
              // WalletConnect's own window: a QR code on computers, wallet apps on phones.
              showQrModal: true,
              qrModalOptions: {
                themeMode: 'light',
                themeVariables: { '--wcm-z-index': '1000' },
              },
              metadata: {
                name: 'OpenSignet',
                description:
                  'Programmable identity and communication infrastructure for AI agents.',
                url: appOrigin,
                icons: [`${appOrigin}${BRAND_ASSETS.appIcon}`],
              },
            }) as ReturnType<typeof walletConnect>,
          ]
        : []),
    ],
    transports: {
      [base.id]: http('https://mainnet.base.org'),
    },
    ssr: true,
  });
}

export function clearWalletConnectionStorage() {
  if (typeof window === 'undefined') return;

  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      clearStorage(window[name]);
    } catch {
      // Access to storage itself can be denied in private or embedded browsers.
    }
  }
}

function clearStorage(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }

  for (const key of keys) {
    if (!shouldClearWalletStorageKey(key)) continue;
    try {
      storage.removeItem(key);
    } catch {
      // Ignore browser storage permission errors.
    }
  }
}

function shouldClearWalletStorageKey(key: string) {
  const normalized = key.toLowerCase();
  // Preserve wagmi's disconnect shim, including Coinbase-named provider IDs.
  // Removing it allows legacy wallets without revokePermissions to reconnect.
  if (normalized.startsWith('wagmi.') && normalized.endsWith('.disconnected')) return false;
  return (
    WALLET_STORAGE_KEYS.has(normalized) ||
    normalized.startsWith('wc@2:') ||
    normalized.includes('walletconnect') ||
    normalized.includes('walletlink') ||
    normalized.includes('coinbasewallet') ||
    normalized.includes('coinbase.wallet') ||
    normalized.includes('coinbase-wallet') ||
    normalized.includes('cbwallet') ||
    normalized.startsWith('cbw')
  );
}
