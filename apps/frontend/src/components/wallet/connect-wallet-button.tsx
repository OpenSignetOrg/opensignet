'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from 'wagmi';
import { Wallet, X } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { WalletList } from '@/components/wallet/wallet-list';
import { cn, shortAddress } from '@/lib/utils';

interface ConnectWalletButtonProps {
  className?: string;
  /** Visible label and icon for the disconnected trigger (defaults to Connect Wallet). */
  label?: string;
  icon?: ReactNode;
  /** Called when the person activates the trigger, before the wallet list opens. */
  onOpen?: () => void;
  /** Extra classes for the wrapper, for example to stretch the trigger to full width. */
  wrapperClassName?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}

const WALLET_DIALOG_OPEN_ATTR = 'data-opensignet-wallet-dialog-open';

/** A wallet trigger that opens the shared wallet list in a dialog. */
export function ConnectWalletButton({
  className,
  variant = 'gradient',
  size = 'sm',
  label = 'Connect Wallet',
  icon,
  onOpen,
  wrapperClassName,
}: ConnectWalletButtonProps) {
  const { address, isConnected, status } = useAccount();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status !== 'reconnecting') setReady(true);
  }, [status]);

  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);

  if (!ready || status === 'reconnecting') {
    return <div className={cn('h-9 w-36 rounded-md', className)} />;
  }

  return (
    <div className={cn('relative inline-flex', wrapperClassName)}>
      <Button
        type="button"
        variant={isConnected ? 'outline' : variant}
        size={size}
        className={cn(isConnected && 'font-mono', className)}
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
      >
        {isConnected && address ? (
          <>
            <span className="h-2 w-2 rounded-full bg-orange-600" />
            {shortAddress(address)}
          </>
        ) : (
          <>
            {icon ?? <Wallet className="h-4 w-4" />}
            {label}
          </>
        )}
      </Button>

      {open && createPortal(<WalletDialog onClose={() => setOpen(false)} />, document.body)}
    </div>
  );
}

function WalletDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.setAttribute(WALLET_DIALOG_OPEN_ATTR, 'true');
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.removeAttribute(WALLET_DIALOG_OPEN_ATTR);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      data-opensignet-wallet-dialog="true"
      className="opensignet-wallet-backdrop fixed inset-0 z-[80] flex items-end justify-center px-3 pb-3 pt-6 sm:items-center sm:px-6 sm:py-6"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-popover shadow-[0_24px_60px_-30px_rgba(20,21,18,0.55)] outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold tracking-tight">
              Connect a wallet
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Choose a wallet to use on Base.
            </p>
          </div>
          <button
            type="button"
            className="-mr-1 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-3">
          <WalletList />
        </div>
      </div>
    </div>
  );
}
