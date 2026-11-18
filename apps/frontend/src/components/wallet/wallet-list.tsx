'use client';

import { useEffect, useMemo, useState } from 'react';
import { useConnect, useSwitchChain } from 'wagmi';
import type { Connector } from 'wagmi';
import { base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors/injected';
import { ChevronRight, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { InlineNotice } from '@/components/ui/inline-notice';
import { CoinbaseWalletLogo, WalletConnectLogo } from '@/components/sign-in/provider-logos';
import { getBaseChainSwitchCopy } from '@/lib/base-chain';
import { clearWalletConnectionStorage } from '@/lib/wagmi';
import {
  compareWalletProviders,
  isVisibleWalletProvider,
  readEip6963ProviderDetail,
  walletIconSource,
  type Eip6963ProviderDetail,
  type InjectedProvider,
} from '@/lib/wallet-discovery';
import { cn } from '@/lib/utils';

const CONNECT_TIMEOUT_MS = 20_000;
export const COINBASE_RDNS = 'com.coinbase.wallet';

type ConnectableConnector = Connector | ReturnType<typeof injected>;

type WalletOption = {
  key: string;
  name: string;
  icon: { kind: 'image'; src: string } | { kind: 'coinbase' } | { kind: 'walletconnect' } | null;
  /** Null only for WalletConnect on a deployment without its project ID (never in production). */
  connector: ConnectableConnector | null;
  /** Connectors that keep a pairing in storage are reset before and after a failed attempt. */
  pairing?: boolean;
};

/**
 * The one wallet list used everywhere a wallet is connected: wallets found in this browser
 * (EIP-6963, with their own icons), Coinbase Wallet with its official mark, and WalletConnect for
 * mobile wallets. Base is the only chain; a wallet on another network is asked to switch.
 */
export function WalletList({ className }: { className?: string }) {
  const { connectAsync, connectors, reset } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const announced = useAnnouncedWallets();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => buildOptions(connectors, announced), [connectors, announced]);

  async function connect(option: WalletOption) {
    const connector = option.connector;
    if (!connector) {
      setError('WalletConnect isn’t available on this site yet. Choose another wallet.');
      return;
    }
    reset();
    if (option.pairing) clearWalletConnectionStorage();
    setPendingKey(option.key);
    setError(null);

    // WalletConnect shows its own window (a QR code on computers, wallet apps on phones) and waits
    // for the person to scan or choose, so only browser wallets get a response deadline.
    let timedOut = false;
    const timeout =
      option.key === 'walletconnect'
        ? undefined
        : window.setTimeout(() => {
            timedOut = true;
            reset();
            setPendingKey(null);
            setError('Your wallet didn’t respond. Open it and try again.');
            if (option.pairing) clearWalletConnectionStorage();
          }, CONNECT_TIMEOUT_MS);

    try {
      const result = await connectAsync({ connector });
      if (result.chainId !== base.id) {
        try {
          await switchChainAsync({ chainId: base.id });
        } catch (switchError) {
          const copy = getBaseChainSwitchCopy(switchError);
          if (copy.kind === 'cancelled') toast.info(copy.title, { description: copy.description });
          else toast.error(copy.title, { description: copy.description });
        }
      }
    } catch (connectError) {
      reset();
      if (option.pairing) clearWalletConnectionStorage();
      if (!timedOut && !isCancelled(connectError)) {
        setError('The wallet couldn’t connect. Try again, or choose another wallet.');
      }
    } finally {
      window.clearTimeout(timeout);
      setPendingKey(null);
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <ul className="flex flex-col gap-2" aria-label="Wallets">
        {options.map((option) => {
          const pending = pendingKey === option.key;
          return (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => void connect(option)}
                disabled={pendingKey !== null}
                aria-busy={pending || undefined}
                className="group flex min-h-14 w-full items-center gap-3 rounded-xl border border-border/80 bg-card px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] hover:border-foreground/25 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:opacity-100"
              >
                <WalletIcon option={option} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    <bdi>{option.name}</bdi>
                  </span>
                </span>
                {pending ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && <InlineNotice className="mt-1">{error}</InlineNotice>}
    </div>
  );
}

function WalletIcon({ option }: { option: WalletOption }) {
  const [failed, setFailed] = useState(false);
  const frame =
    'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] [&>svg]:h-full [&>svg]:w-full';
  const { icon } = option;
  if (icon?.kind === 'coinbase')
    return (
      <span className={frame} aria-hidden>
        <CoinbaseWalletLogo />
      </span>
    );
  if (icon?.kind === 'walletconnect')
    return (
      <span className={frame} aria-hidden>
        <WalletConnectLogo />
      </span>
    );
  if (icon?.kind === 'image' && !failed)
    return (
      <span className={frame} aria-hidden>
        {/* Wallet-announced data image, rendered only as <img> (never inline markup). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icon.src}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  return (
    <span
      className={cn(frame, 'border border-border/80 bg-secondary/70 text-muted-foreground')}
      aria-hidden
    >
      <Wallet className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
}

/** Wallets this browser announces (EIP-6963), most popular first. */
export function useAnnouncedWallets() {
  const [wallets, setWallets] = useState<Eip6963ProviderDetail[]>([]);
  useEffect(() => {
    function onAnnounce(event: Event) {
      const detail = readEip6963ProviderDetail((event as CustomEvent<unknown>).detail);
      if (!detail || !isVisibleWalletProvider(detail)) return;
      setWallets((current) =>
        current.some(
          (item) => item.info.uuid === detail.info.uuid || item.provider === detail.provider,
        )
          ? current
          : [...current, detail].sort(compareWalletProviders),
      );
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);
  return wallets;
}

function buildOptions(connectors: readonly Connector[], announced: Eip6963ProviderDetail[]) {
  const options: WalletOption[] = [];
  let coinbaseShown = false;

  for (const detail of announced) {
    const isCoinbase = detail.info.rdns.toLowerCase() === COINBASE_RDNS;
    coinbaseShown ||= isCoinbase;
    options.push({
      key: `eip6963:${detail.info.uuid}`,
      name: isCoinbase ? 'Coinbase Wallet' : detail.info.name,
      // Coinbase always shows its current official icon; other wallets show their own.
      icon: isCoinbase
        ? { kind: 'coinbase' }
        : detail.info.icon
          ? { kind: 'image', src: detail.info.icon }
          : null,
      connector: injected({
        shimDisconnect: true,
        target: {
          id: detail.info.rdns || detail.info.uuid,
          name: detail.info.name,
          icon: detail.info.icon,
          provider: detail.provider as never,
        },
      }),
    });
  }

  // Browsers whose wallet does not announce itself (EIP-6963) still get a working option.
  if (announced.length === 0 && typeof window !== 'undefined') {
    for (const id of ['metaMask', 'rabby', 'baseApp'] as const) {
      const connector = connectors.find((item) => item.id === id);
      if (!connector || !legacyWalletAvailable(id)) continue;
      coinbaseShown ||= id === 'baseApp';
      options.push({
        key: `legacy:${id}`,
        name: id === 'metaMask' ? 'MetaMask' : id === 'rabby' ? 'Rabby' : 'Coinbase Wallet',
        icon:
          id === 'baseApp'
            ? { kind: 'coinbase' }
            : (() => {
                const src = walletIconSource(connector.icon);
                return src ? { kind: 'image' as const, src } : null;
              })(),
        connector,
      });
    }
    const generic = connectors.find((item) => item.id === 'injected');
    if (options.length === 0 && generic && hasInjectedProvider()) {
      options.push({
        key: 'legacy:browser',
        name: 'Browser wallet',
        icon: null,
        connector: generic,
      });
    }
  }

  const coinbase = connectors.find((item) => item.id === 'coinbaseWalletSDK');
  if (coinbase && !coinbaseShown) {
    options.push({
      key: 'coinbase',
      name: 'Coinbase Wallet',
      icon: { kind: 'coinbase' },
      connector: coinbase,
      pairing: true,
    });
  }

  // Always last: any other wallet through WalletConnect.
  options.push({
    key: 'walletconnect',
    name: 'WalletConnect',
    icon: { kind: 'walletconnect' },
    connector: connectors.find((item) => item.id === 'walletConnect') ?? null,
    pairing: true,
  });

  return options;
}

function hasInjectedProvider() {
  return Boolean((window as Window & { ethereum?: unknown }).ethereum);
}

function legacyWalletAvailable(id: 'metaMask' | 'rabby' | 'baseApp') {
  const ethereum = (window as Window & { ethereum?: InjectedProvider }).ethereum;
  const providers: InjectedProvider[] = ethereum?.providers ?? (ethereum ? [ethereum] : []);
  return providers.some((provider) => {
    if (id === 'metaMask')
      return Boolean(
        provider.isMetaMask &&
        !provider.isRabby &&
        !provider.isCoinbaseWallet &&
        !provider.isBaseWallet,
      );
    if (id === 'rabby') return Boolean(provider.isRabby);
    return Boolean(provider.isCoinbaseWallet || provider.isBaseWallet);
  });
}

function isCancelled(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return [
    'user rejected',
    'user denied',
    'user closed',
    'cancel',
    'modal closed',
    'request rejected',
  ].some((phrase) => message.includes(phrase));
}
