import { cn } from '@/lib/utils';
import { COINBASE_WALLET_ICON } from './coinbase-wallet-icon';

/*
 * Official third-party marks, unaltered (colour, proportions and shape as published):
 * - Google "G": Sign in with Google branding guidelines (standard colour version only).
 * - Coinbase Wallet: its current app icon from the official store listing (coinbase-wallet-icon.ts).
 * - WalletConnect: the mark from the official Reown/WalletConnect UI kit on WalletConnect blue.
 */

export function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn('h-[18px] w-[18px] shrink-0', className)}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function CoinbaseWalletLogo({ className }: { className?: string }) {
  return (
    // Official app icon, a small inline data image (see coinbase-wallet-icon.ts).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={COINBASE_WALLET_ICON}
      alt=""
      aria-hidden
      decoding="async"
      className={cn('block h-full w-full shrink-0 object-cover', className)}
    />
  );
}

export function WalletConnectLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden className={cn('shrink-0', className)}>
      <rect width="96" height="96" fill="#3396FF" />
      <path
        fill="#FFFFFF"
        transform="translate(18 27) scale(0.625)"
        d="M25.32 18.8a32.56 32.56 0 0 1 45.36 0l1.5 1.47c.63.62.63 1.61 0 2.22l-5.15 5.05c-.31.3-.82.3-1.14 0l-2.07-2.03a22.71 22.71 0 0 0-31.64 0l-2.22 2.18c-.31.3-.82.3-1.14 0l-5.15-5.05a1.55 1.55 0 0 1 0-2.22l1.65-1.62Zm56.02 10.44 4.59 4.5c.63.6.63 1.6 0 2.21l-20.7 20.26c-.62.61-1.63.61-2.26 0L48.28 41.83a.4.4 0 0 0-.56 0L33.03 56.21c-.63.61-1.64.61-2.27 0L10.07 35.95a1.55 1.55 0 0 1 0-2.22l4.59-4.5a1.63 1.63 0 0 1 2.27 0L31.6 43.63a.4.4 0 0 0 .57 0l14.69-14.38a1.63 1.63 0 0 1 2.26 0l14.69 14.38a.4.4 0 0 0 .57 0l14.68-14.38a1.63 1.63 0 0 1 2.27 0Z"
      />
    </svg>
  );
}
