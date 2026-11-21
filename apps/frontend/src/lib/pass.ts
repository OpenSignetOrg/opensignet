import { z } from 'zod';

/**
 * The OpenSignet Pass as its token metadata needs it. A pass is public onchain (the contract
 * stores its domain and links), so its metadata is public too; nothing else about the account
 * is ever included.
 */
export const passSchema = z
  .object({
    tokenId: z.number().int().positive(),
    domain: z.string().min(3).max(253),
    basename: z.string().max(253).nullable(),
    ensName: z.string().max(253).nullable(),
    mintedAt: z.string(),
  })
  .strict();
export type PassRecord = z.infer<typeof passSchema>;

/** A token id as the path carries it. */
export function parseTokenId(value: string): number | null {
  if (!/^[1-9]\d{0,14}$/.test(value)) return null;
  return Number(value);
}

/**
 * The public API, as the request router reaches it: the local service in development, the API
 * host otherwise (never the request's own host, so preview hosts work too).
 */
const API_ORIGIN =
  process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8792' : 'https://api.opensignet.com';

/** Reads a live pass from the public API; null when there is none. */
export async function readPass(tokenId: number): Promise<PassRecord | null> {
  const response = await fetch(new URL(`/api/v1/passes/${tokenId}`, API_ORIGIN), {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('pass unavailable');
  return passSchema.parse(await response.json());
}

export const PASS_HEADERS = {
  // Wallets and marketplaces may cache a little; a burned pass disappears within minutes.
  'Cache-Control': 'public, max-age=300, s-maxage=300',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
} as const;
