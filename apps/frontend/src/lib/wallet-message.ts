import { SiweMessage } from 'siwe';
import { getAddress } from 'viem';

/**
 * The EIP-4361 message a wallet signs to prove control for sign-in, linking or approving a
 * sensitive change. The backend checks domain, origin, chain, nonce (single use, short-lived),
 * issue time and the statement, so a signature is only good for the one action it names.
 */
export function buildWalletMessage({
  address,
  chainId,
  nonce,
  statement,
}: {
  address: string;
  chainId: number;
  nonce: string;
  statement: string;
}): string {
  return new SiweMessage({
    domain: window.location.host,
    address: getAddress(address),
    statement,
    uri: window.location.origin,
    version: '1',
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 5 * 60_000).toISOString(),
  }).prepareMessage();
}

export const WALLET_STATEMENTS = {
  link: 'Link this wallet to my OpenSignet account.',
  approve: 'Approve a security change on my OpenSignet account.',
} as const;
